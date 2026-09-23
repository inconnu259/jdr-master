import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PartieDetail } from './partie-detail';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal, type WritableSignal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import type {
  AnnouncementDto,
  CharacterDto,
  CharacterGroupRoleDto,
  InviteLinkDto,
  PartieDto,
  PartieMemberDto,
  SessionPollDto,
} from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { CharacterService } from '../../../core/characters/character.service';
import { makeAnnouncementDto } from '../../../core/announcements/announcement-dto.fixture';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';
import { PartiesService } from '../../../core/parties/parties.service';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { AnnouncementsService } from '../../../core/announcements/announcements.service';
import { UnseenAnnouncementsService } from '../../../core/announcements/unseen-announcements.service';
import { HommeDragonService } from '../../../core/homme-dragon/homme-dragon.service';
import { CharacterRolesService } from '../../../core/character-roles/character-roles.service';
import { MatDialog } from '@angular/material/dialog';
import { MatTabGroup } from '@angular/material/tabs';
import { TONE_MAP } from '../../../core/theme/tones';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';

// Story 18.3 : PartieDetail injecte désormais RealtimeService (providedIn: 'root', non fourni par
// aucune des configurations TestBed de ce fichier — Angular l'auto-construit réellement partout).
// jsdom (^28.0.0) n'implémente pas EventSource (piège déjà documenté Story 18.2) — stub global
// plutôt qu'un mock RealtimeService par configuration : le comportement SSE réel n'est pas la
// préoccupation des tests existants de ce fichier, seul le describe dédié plus bas l'exerce.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  closed = false;
  constructor(
    public readonly url: string,
    public readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: () => void): void {
    (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)!).push(cb);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string): void {
    (this.listeners.get(type) ?? []).forEach((cb) => cb());
  }
}

let originalEventSource: unknown;
beforeEach(() => {
  originalEventSource = (globalThis as any).EventSource;
  FakeEventSource.instances = [];
  (globalThis as any).EventSource = FakeEventSource;
});
afterEach(() => {
  (globalThis as any).EventSource = originalEventSource;
});

/** Story 8.8 (revue de code) : `activePolls` est désormais chargé via `ScenariosService.listAll()`
 *  (plus `PollService.getCurrentPoll()`, un seul poll par Partie) — enveloppe chaque poll fourni
 *  dans un scénario/séance synthétique minimal pour alimenter le mock `listAll`. */
function wrapPollsAsScenarios(polls: SessionPollDto[]): any[] {
  return polls.map((poll, i) => ({
    id: `s-${poll.id}`,
    partieId: poll.partieId,
    title: `Scénario ${i + 1}`,
    description: null,
    status: 'COURANT',
    dureeHeures: null,
    dureeSeances: null,
    resumeFin: null,
    createdAt: '',
    closedAt: null,
    seances: [
      {
        id: `seance-${poll.id}`,
        scenarioId: `s-${poll.id}`,
        compteRendu: null,
        createdAt: '',
        poll,
      },
    ],
  }));
}

function makeScenariosService(polls: SessionPollDto[] = []) {
  return {
    listDrafts: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue(wrapPollsAsScenarios(polls)),
    changed: signal(0),
    // Story 19.1 (Task 2) : RealtimeService injecte désormais aussi ScenariosService — nécessaire
    // pour que la connexion SSE réelle (stub EventSource global, cf. haut de fichier) ne lève pas.
    notifyRealtimeChanged: vi.fn(),
  };
}

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
    mjPseudo: 'mj-pseudo',
    mjDisplayName: 'MJ Nom',
    createdAt: new Date().toISOString(),
    nextSessionDate: null,
    nextSessionSlot: null,
    role: 'mj',
    status: 'EN_COURS',
    isFavorite: false,
    coverImageVersion: null,
    ...overrides,
  };
}

function makeToneService() {
  return { tone: signal(TONE_MAP['grimoire-emeraude']) };
}

function makeAuthService(userId: string, displayName = 'Test') {
  return {
    currentUser: signal({
      id: userId,
      pseudo: 'Test',
      displayName,
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
  // Story 18.3 (AD-4) : contrat notifyChanged()/changed, consommé par l'effect() de PartieDetail.
  // notifyChanged() incrémente réellement le signal (comme l'implémentation réelle), pour que
  // l'effect() du composant sous test réagisse — pas un simple espion sans effet.
  const changed = signal(0);
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
    close: vi.fn().mockResolvedValue({ ...partie, status: 'TERMINEE' }),
    reopen: vi.fn().mockResolvedValue({ ...partie, status: 'EN_COURS' }),
    listXpDistributions: vi.fn().mockResolvedValue([]),
    createXpDistribution: vi.fn(),
    changed,
    notifyChanged: vi.fn(() => changed.update((v) => v + 1)),
  };
}

interface CreateFixtureOptions {
  members?: PartieMemberDto[];
  poll?: SessionPollDto | null;
  polls?: SessionPollDto[];
  characters?: CharacterDto[];
  /** Revue de code (Story 29.15) : permet de maintenir `listByPartie` en attente (non résolue) pour
   *  observer l'état du composant pendant le chargement — sinon `characters` prend la valeur de
   *  `characters ?? []` de façon synchrone-microtask comme tous les autres tests de ce fichier. */
  charactersPromise?: Promise<CharacterDto[]>;
  links?: InviteLinkDto[];
  announcements?: AnnouncementDto[];
  unseenAnnouncementIds?: string[];
  markAnnouncementRead?: ReturnType<typeof vi.fn>;
  characterRoles?: CharacterGroupRoleDto[];
  noopAnimations?: boolean;
  desktop?: boolean;
  displayName?: string;
  announcementIdQueryParam?: string;
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
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: { get: () => partie.id },
            queryParamMap: { get: () => options.announcementIdQueryParam ?? null },
          },
        },
      },
      { provide: AuthService, useValue: makeAuthService(currentUserId, options.displayName) },
      {
        provide: PartiesService,
        useValue: makePartiesService(partie, options.members ?? [], options.links ?? []),
      },
      { provide: BreakpointObserver, useValue: makeBreakpointObserver(options.desktop ?? true) },
      {
        provide: MyPartiesService,
        useValue: { refreshMjParties: vi.fn(), playerParties: signal([]) },
      },
      { provide: AvailabilityService, useValue: { notifyChanged: vi.fn() } },
      {
        provide: CharacterService,
        useValue: {
          listByPartie: vi
            .fn()
            .mockImplementation(
              () => options.charactersPromise ?? Promise.resolve(options.characters ?? []),
            ),
          getGameSystemContent: vi.fn().mockResolvedValue({
            class: [{ key: 'menestrel', data: { label: 'Ménestrel' } }],
          }),
          getGameSystemAsset: vi
            .fn()
            .mockResolvedValue(new Blob(['%PDF-1.6'], { type: 'application/pdf' })),
          // Bug fix (temps réel) : PartieDetail réagit désormais à ce signal (roster).
          changed: signal(0),
        },
      },
      { provide: ThemeToneService, useValue: makeToneService() },
      {
        provide: ScenariosService,
        useValue: makeScenariosService(options.polls ?? (options.poll ? [options.poll] : [])),
      },
      {
        provide: AnnouncementsService,
        useValue: {
          create: vi.fn(),
          listAll: vi.fn().mockResolvedValue(options.announcements ?? []),
          // Bug fix (temps réel) : PartieDetail réagit désormais à ce signal (annonces).
          changed: signal(0),
        },
      },
      {
        provide: UnseenAnnouncementsService,
        useValue: {
          unseenAnnouncements: signal(
            (options.announcements ?? []).filter((a) =>
              (options.unseenAnnouncementIds ?? []).includes(a.id),
            ),
          ),
          markRead: options.markAnnouncementRead ?? vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: HommeDragonService,
        useValue: {
          findOne: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
          update: vi.fn(),
          // Story 20.2 (Task 3) : HommeDragonSheet (rendu transitivement) réagit désormais à ce signal.
          changed: signal(0),
        },
      },
      {
        provide: CharacterRolesService,
        useValue: {
          listForPartie: vi.fn().mockResolvedValue(options.characterRoles ?? []),
          // Story 27.3 : PartieDetail réagit désormais à ce signal (badges de rôle).
          changed: signal(0),
        },
      },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PartieDetail);
  fixture.detectChanges();
  // ngOnInit enchaîne plusieurs await (partie, membres, poll actif, characterRoles depuis la Story
  // 27.3...) — whenStable() ne garantit pas toujours le drainage complet de chaînes de promesses
  // simples (mocks) en environnement zoneless. On vide explicitement la file de microtasks à
  // plusieurs reprises pour laisser chaque await se résoudre.
  for (let i = 0; i < 15; i++) {
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
    expect(text).toContain('Soir');
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

  // ─── Story 32.3 — le widget porte désormais un badge d'état ──────────────
  //
  // ⚠️ Le badge RÉSUME, il ne remplace rien : la ligne de date et la ligne de statut du vote
  // restent exactement là où la story 32.2 les avait posées (vérifié explicitement ci-dessous).
  function isoInDays(days: number): string {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  }

  function widgetBadge(el: HTMLElement): string {
    return (el.querySelector('.scheduling-widget .status-badge')?.textContent ?? '').trim();
  }

  it('aucune séance à venir → badge « À planifier », sans effacer l’état vide existant', async () => {
    const { el } = await createFixture(
      makePartie({ nextSessionDate: null, nextSessionSlot: null }),
      MJ_ID,
    );
    expect(widgetBadge(el)).toBe('À planifier');
    expect(el.querySelector('.scheduling-widget .muted')).toBeTruthy();
  });

  it('séance à venir (> 7 j) → badge « Programmée », la ligne de date reste affichée', async () => {
    const { el } = await createFixture(
      makePartie({ nextSessionDate: isoInDays(10), nextSessionSlot: 'EVENING' }),
      MJ_ID,
    );
    expect(widgetBadge(el)).toBe('Programmée');
    expect(el.querySelector('.scheduling-widget .next-session-date')).toBeTruthy();
  });

  it('🚨 une date déjà passée ne fait jamais apparaître « À débriefer » ici (widget « Prochaine séance »)', async () => {
    const { el } = await createFixture(
      makePartie({ nextSessionDate: isoInDays(-10), nextSessionSlot: 'EVENING' }),
      MJ_ID,
    );
    expect(widgetBadge(el)).toBe('À planifier');
  });
});

// ─── Statut du vote (Story 3.5) ───────────────────────────────────────────

describe('PartieDetail — statut du vote', () => {
  afterEach(() => TestBed.resetTestingModule());

  const members: PartieMemberDto[] = [
    {
      userId: 'u1',
      pseudo: 'Alice',
      displayName: 'Alice au pays',
      email: 'alice@test.com',
      joinedAt: '',
    },
    { userId: 'u2', pseudo: 'Bob', displayName: 'Bobby', email: 'bob@test.com', joinedAt: '' },
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
      // Story 36.6 — effectif de la troupe (MJ + membres).
      membersCount: 4,
      options: [
        {
          id: 'opt1',
          date: '2026-08-01T00:00:00.000Z',
          slot: 'MORNING',
          votes: votesOnOpt.map((userId) => ({
            userId,
            pseudo: userId,
            displayName: userId,
            answer: 'YES' as const,
          })),
        },
      ],
    };
  }

  it('affiche la ligne de statut X/Y quand un poll OPEN existe — Y = poll.membersCount (MJ compris, deferred-work 2026-08-24)', async () => {
    const { el } = await createFixture(makePartie(), MJ_ID, { members, poll: makePoll(['u1']) });
    const line = el.querySelector('.poll-status-line');
    expect(line).toBeTruthy();
    // `members` ne porte que 2 entrées (le MJ n'a jamais de ligne Membership), mais
    // `makePoll().membersCount` vaut 4 (MJ compris, valeur serveur) — le Y affiché suit
    // membersCount, pas members().length, sous peine de reproduire le bug à deux dénominateurs
    // que la 36.6 a déjà corrigé côté calendrier (panneau `poll-status`).
    expect(line!.textContent).toContain('1/4');
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

  it('plusieurs votes OPEN en parallèle → message agrégé "N votes de date en cours" (Story 8.8, revue de code)', async () => {
    const poll1 = { ...makePoll(['u1']), id: 'poll1', partieId: 'party-1' };
    const poll2 = { ...makePoll([]), id: 'poll2', partieId: 'party-1' };
    const { el } = await createFixture(makePartie(), MJ_ID, { members, polls: [poll1, poll2] });

    const line = el.querySelector('.poll-status-line');
    expect(line).toBeTruthy();
    expect(line!.textContent).toContain('2 votes de date en cours');
  });

  // ─── Story 32.3 — le badge du widget suit le vote, et suit le LECTEUR ────
  function widgetBadge(el: HTMLElement): string {
    return (el.querySelector('.scheduling-widget .status-badge')?.textContent ?? '').trim();
  }

  it('vote ouvert auquel je n’ai pas répondu → « Réponds au vote »', async () => {
    // `makePoll([])` : personne n'a voté, donc le lecteur non plus.
    const { el } = await createFixture(makePartie(), 'u1', { members, poll: makePoll([]) });
    expect(widgetBadge(el)).toBe('Réponds au vote');
  });

  it('vote ouvert auquel j’ai répondu → « Vote en cours », libellé distinct du précédent', async () => {
    const { el } = await createFixture(makePartie(), 'u1', { members, poll: makePoll(['u1']) });
    expect(widgetBadge(el)).toBe('Vote en cours');
  });

  it('🚨 plusieurs votes : c’est celui qui attend MA réponse qui gagne le badge', async () => {
    // `poll1` est déjà répondu, `poll2` ne l'est pas : prendre le premier venu masquerait
    // l'appel à l'action — exactement ce que la story cherche à rendre visible.
    const poll1 = { ...makePoll(['u1']), id: 'poll1', partieId: 'party-1' };
    const poll2 = { ...makePoll([]), id: 'poll2', partieId: 'party-1' };
    const { el } = await createFixture(makePartie(), 'u1', { members, polls: [poll1, poll2] });
    expect(widgetBadge(el)).toBe('Réponds au vote');
  });

  it('🚨 date confirmée → « Programmée », même si un vote ouvert court sur une AUTRE séance', async () => {
    // `activePolls()` est scopé à la PARTIE : sans cette garde, le widget annoncerait
    // « Réponds au vote » juste au-dessus de la date confirmée d'une tout autre séance.
    const future = new Date();
    future.setUTCHours(0, 0, 0, 0);
    future.setUTCDate(future.getUTCDate() + 10);
    const { el } = await createFixture(
      makePartie({ nextSessionDate: future.toISOString(), nextSessionSlot: 'EVENING' }),
      'u1',
      { members, poll: makePoll([]) },
    );
    expect(widgetBadge(el)).toBe('Programmée');
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

// ─── Onglet « Fiches » générique : tous les personnages, le sien en tête (spec
//     fiches-personnages-partie-et-retour) ──────────────────────────────────

describe('PartieDetail — onglet « Fiches » générique (spec fiches-personnages-partie-et-retour)', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** Sélectionne l'onglet « Fiches » (rendu en index 1 pour tout joueur non-MJ) — même patron que
   *  les tests d'atterrissage ci-dessus (Story 29.15). */
  function clickFichesTab(el: HTMLElement, fixture: ComponentFixture<PartieDetail>): void {
    const tab = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).find(
      (t) => t.textContent?.trim() === 'Fiches',
    );
    tab?.click();
    fixture.detectChanges();
  }

  /** `.character-summary-card__name` porte aussi le badge de niveau imbriqué — on le retire avant
   *  de lire le texte pour ne pas dépendre du whitespace exact entre les deux noeuds. */
  function cardName(nameEl: Element): string {
    const clone = nameEl.cloneNode(true) as HTMLElement;
    clone.querySelector('.character-summary-card__level')?.remove();
    return clone.textContent?.trim() ?? '';
  }

  it('le libellé de l’onglet est désormais « Fiches » (plus « Ma fiche »)', async () => {
    const { el } = await createFixture(makePartie({ gameSystemId: 'ryuutama' }), PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
    });

    const tabLabels = Array.from(el.querySelectorAll('div[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabLabels).toContain('Fiches');
    expect(tabLabels).not.toContain('Ma fiche');
  });

  it('liste tous les personnages de la partie, le sien en tête, avec le niveau visible sur chacun (AC1)', async () => {
    const mine = makeCharacterDto({
      id: 'mine',
      userId: PLAYER_ID,
      partieId: 'party-1',
      level: 3,
      sheetData: { narrative: { name: 'Fenn' } },
    });
    const other1 = makeCharacterDto({
      id: 'other1',
      userId: 'other-1',
      partieId: 'party-1',
      level: 2,
      sheetData: { narrative: { name: 'Bram' } },
    });
    const other2 = makeCharacterDto({
      id: 'other2',
      userId: 'other-2',
      partieId: 'party-1',
      level: 5,
      sheetData: { narrative: { name: 'Iris' } },
    });

    // Ordre de chargement volontairement différent de l'ordre attendu à l'écran : la partition
    // « soi d'abord » doit reposer sur charactersSelfFirst(), pas sur l'ordre de characters().
    const { fixture, el } = await createFixture(
      makePartie({ gameSystemId: 'ryuutama' }),
      PLAYER_ID,
      { desktop: true, noopAnimations: true, characters: [other1, mine, other2] },
    );

    clickFichesTab(el, fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    const names = Array.from(
      el.querySelectorAll(
        '.party-sheets-tab app-character-summary-card .character-summary-card__name',
      ),
    ).map(cardName);
    expect(names).toEqual(['Fenn', 'Bram', 'Iris']);

    const levels = Array.from(
      el.querySelectorAll(
        '.party-sheets-tab app-character-summary-card .character-summary-card__level',
      ),
    ).map((n) => n.textContent?.trim());
    expect(levels).toEqual(['Niv. 3', 'Niv. 2', 'Niv. 5']);
  });

  it('joueur sans personnage personnel, d’autres joueurs en ont → message + CTA de création ET la liste des autres personnages en dessous (I/O Matrix, cas 2)', async () => {
    const other1 = makeCharacterDto({
      id: 'other1',
      userId: 'other-1',
      partieId: 'party-1',
      level: 1,
      sheetData: { narrative: { name: 'Bram' } },
    });
    const other2 = makeCharacterDto({
      id: 'other2',
      userId: 'other-2',
      partieId: 'party-1',
      level: 4,
      sheetData: { narrative: { name: 'Iris' } },
    });
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });

    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
      characters: [other1, other2],
    });

    // Atterrissage automatique sur « Fiches » (canCreateCharacter() = true, Story 29.15) — pas de
    // clic explicite nécessaire, mais on le fait quand même pour ne pas dépendre de ce détail.
    clickFichesTab(el, fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.party-sheets-tab .muted')?.textContent?.trim()).toBeTruthy();
    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeTruthy();

    const names = Array.from(
      el.querySelectorAll(
        '.party-sheets-tab app-character-summary-card .character-summary-card__name',
      ),
    ).map(cardName);
    expect(names).toEqual(['Bram', 'Iris']);
  });

  it('joueur sans personnage personnel, personne d’autre n’en a → message + CTA seulement, aucune carte (I/O Matrix, cas 3)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });

    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
      characters: [],
    });

    clickFichesTab(el, fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.party-sheets-tab .muted')?.textContent?.trim()).toBeTruthy();
    expect(el.querySelector('.party-sheets-tab app-character-summary-card')).toBeNull();
  });

  it('passe [showOwnerInfo]="true" à app-character-summary-card sur cette liste — exception délibérée et scopée à cet onglet « Fiches » (retour utilisateur : le nom du joueur propriétaire clarifie la liste quand plusieurs compagnons sont affichés) ; la règle générale « jamais pour un joueur » de showOwnerInfo reste inchangée ailleurs (roster, MyCharacters…)', async () => {
    const mine = makeCharacterDto({
      id: 'mine',
      userId: PLAYER_ID,
      partieId: 'party-1',
      sheetData: { narrative: { name: 'Fenn' } },
    });
    const { fixture, el } = await createFixture(
      makePartie({ gameSystemId: 'ryuutama' }),
      PLAYER_ID,
      { desktop: true, noopAnimations: true, characters: [mine] },
    );

    clickFichesTab(el, fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('.party-sheets-tab app-character-summary-card'))
      ?.componentInstance as { showOwnerInfo: () => boolean } | undefined;
    expect(card?.showOwnerInfo()).toBe(true);
  });
});

// ─── Nouvelle disposition de la page Partie (Story 6.1) ───────────────────

describe('PartieDetail — roster (Story 6.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const members: PartieMemberDto[] = [
    { userId: MJ_ID, pseudo: 'Sylas', displayName: 'Sylas', email: 'sylas@test.com', joinedAt: '' },
    {
      userId: PLAYER_ID,
      pseudo: 'Alice',
      displayName: 'Alice au pays',
      email: 'alice@test.com',
      joinedAt: '',
    },
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

  it('mobile + joueur (non-MJ) → affiche aussi app-roster-strip, pas app-roster-rail (Story 31.5 : roster mobile ouvert à tout membre)', async () => {
    const { el } = await createFixture(makePartie(), PLAYER_ID, { members, desktop: false });
    expect(el.querySelector('app-roster-strip')).not.toBeNull();
    expect(el.querySelector('app-roster-rail')).toBeNull();
  });

  it('mobile + joueur (non-MJ) → le slot "+ Inviter" du roster-strip est désactivé (hasFreeSlot=false, réservé au MJ)', async () => {
    const { fixture } = await createFixture(makePartie(), PLAYER_ID, { members, desktop: false });

    const rosterStrip = fixture.debugElement.query(By.css('app-roster-strip'))
      ?.componentInstance as { hasFreeSlot: () => boolean } | undefined;

    expect(rosterStrip?.hasFreeSlot()).toBe(false);
  });

  it("mobile + joueur sans personnage sur un système avec module → l'onglet Ma fiche est sélectionné par défaut (Story 29.15)", async () => {
    const { el } = await createFixture(makePartie({ gameSystemId: 'ryuutama' }), PLAYER_ID, {
      members,
      desktop: false,
      noopAnimations: true,
    });
    expect(el.querySelector('app-roster-rail')).toBeNull();

    const activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Fiches');
  });

  it('desktop + joueur → l\'onglet "Ma fiche" est désormais rendu aussi sur desktop (Story 29.15, unification desktop/mobile)', async () => {
    const { el } = await createFixture(makePartie(), PLAYER_ID, { members, desktop: true });
    const tabLabels = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabLabels).toContain('Fiches');
  });

  it('desktop + joueur sans personnage, système sans module → clic sur sa propre ligne du roster ne navigue plus (Story 29.15, revue de code : slot gardé par canCreateCharacter(), plus de cul-de-sac)', async () => {
    const partie = makePartie({ gameSystemId: 'draconis' });
    const { el } = await createFixture(partie, PLAYER_ID, { members, desktop: true });
    const router = TestBed.inject((await import('@angular/router')).Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    // Le slot reste visible (initiale/avatar + aria-label roster.create_slot_label) — seule la
    // navigation est gardée.
    const ownItem: HTMLElement = el.querySelector(`[data-user-id="${PLAYER_ID}"]`)!;
    expect(ownItem).not.toBeNull();
    ownItem.click();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('desktop + joueur sans personnage, système avec module, partie non clôturée → clic sur sa propre ligne du roster navigue vers la création de personnage (canCreateCharacter() vrai)', async () => {
    const partie = makePartie({ gameSystemId: 'ryuutama' });
    const { el } = await createFixture(partie, PLAYER_ID, { members, desktop: true });
    const router = TestBed.inject((await import('@angular/router')).Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const ownItem: HTMLElement = el.querySelector(`[data-user-id="${PLAYER_ID}"]`)!;
    ownItem.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/parties', 'party-1', 'characters', 'new'], {
      queryParams: { gameSystemId: 'ryuutama' },
    });
  });

  it('joueur ayant déjà un personnage sur cette partie → pas de flicker vers « Ma fiche » pendant le chargement de characters() (Story 29.15, revue de code : charactersLoaded)', async () => {
    let resolveCharacters!: (chars: CharacterDto[]) => void;
    const charactersPromise = new Promise<CharacterDto[]>((resolve) => {
      resolveCharacters = resolve;
    });
    const partie = makePartie({ gameSystemId: 'ryuutama' });
    const existingCharacter = makeCharacterDto({
      id: 'char-1',
      userId: PLAYER_ID,
      partieId: partie.id,
    });

    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      members,
      desktop: true,
      noopAnimations: true,
      charactersPromise,
    });

    // Pendant le chargement (characters() encore [], charactersLoaded() encore false) : ne doit
    // jamais atterrir sur « Ma fiche » ni afficher le CTA de création — c'est précisément le
    // flicker corrigé.
    let activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Détails');
    expect(el.querySelector('a[href*="characters/new"]')).toBeNull();

    resolveCharacters([existingCharacter]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Une fois characters() chargé et révélant le personnage existant : reste sur « Détails »,
    // aucune bascule n'a jamais eu lieu (stabilité).
    activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Détails');
    expect(el.querySelector('a[href*="characters/new"]')).toBeNull();
  });

  it("joueur sans personnage, système avec module → une fois atterri sur « Ma fiche » après le chargement de characters(), n'en bascule plus (Story 29.15, revue de code)", async () => {
    let resolveCharacters!: (chars: CharacterDto[]) => void;
    const charactersPromise = new Promise<CharacterDto[]>((resolve) => {
      resolveCharacters = resolve;
    });
    const partie = makePartie({ gameSystemId: 'ryuutama' });

    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      members,
      desktop: true,
      noopAnimations: true,
      charactersPromise,
    });

    // Pendant le chargement : jamais « Ma fiche » par défaut avant que characters() ne soit connu.
    let activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Détails');

    resolveCharacters([]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // characters() révèle qu'il n'a aucun personnage sur cette partie : atterrit désormais sur
    // « Ma fiche ».
    activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Fiches');

    // Un rendu supplémentaire (ex. re-détection de changements) ne doit jamais le faire basculer
    // ailleurs une fois genuinely atterri sur « Ma fiche ».
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Fiches');
  });

  it("conserve la sélection manuelle d'onglet à travers un redimensionnement (Story 29.15 : « Ma fiche » se rend aussi sur desktop, ne disparaît plus)", async () => {
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
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'party-1' },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: AuthService, useValue: makeAuthService(PLAYER_ID) },
        { provide: PartiesService, useValue: makePartiesService(makePartie(), members, []) },
        { provide: BreakpointObserver, useValue: dynamicBreakpointObserver },
        {
          provide: MyPartiesService,
          useValue: { refreshMjParties: vi.fn(), playerParties: signal([]) },
        },
        { provide: AvailabilityService, useValue: { notifyChanged: vi.fn() } },
        {
          provide: CharacterService,
          useValue: {
            listByPartie: vi.fn().mockResolvedValue([]),
            getGameSystemContent: vi.fn().mockResolvedValue(null),
            changed: signal(0),
          },
        },
        { provide: ThemeToneService, useValue: makeToneService() },
        { provide: ScenariosService, useValue: makeScenariosService() },
        {
          provide: AnnouncementsService,
          useValue: { create: vi.fn(), listAll: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
        {
          provide: CharacterRolesService,
          useValue: { listForPartie: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
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

    // Redimensionnement vers desktop : `tabSetKey` ne dépend plus que de `isMj()` (Story 29.15,
    // l'onglet "Ma fiche" se rend désormais pour tout joueur non-MJ, desktop compris) — le rôle ne
    // change pas, donc `manualTabIndex` n'est jamais réinitialisé (AC4 : la bascule manuelle reste
    // prioritaire sur le calcul par défaut pour la visite en cours).
    breakpoint$.next({ matches: true, breakpoints: {} });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(comp.selectedTabIndex()).toBe(1); // la sélection manuelle survit au redimensionnement
  });
});

// ─── Un bouton clair pour créer son personnage depuis la partie (Story 29.15) ─

describe('PartieDetail — canCreateCharacter / atterrissage sur « Ma fiche » (Story 29.15)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('desktop, joueur sans personnage, système avec module, partie ouverte → atterrit sur "Ma fiche", bouton visible immédiatement (AC1)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
    });

    const comp = fixture.componentInstance as unknown as { selectedTabIndex: () => number };
    expect(comp.selectedTabIndex()).toBe(1);
    const activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Fiches');
    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeTruthy();
  });

  it('mobile, même joueur → atterrissage identique aux deux gabarits (AC2)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: false,
      noopAnimations: true,
    });

    const comp = fixture.componentInstance as unknown as { selectedTabIndex: () => number };
    expect(comp.selectedTabIndex()).toBe(1);
    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeTruthy();
  });

  it('le bouton de création est un vrai lien <a> — atteignable au clavier (AC3)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const { el } = await createFixture(partie, PLAYER_ID, { desktop: true, noopAnimations: true });

    const cta = el.querySelector<HTMLAnchorElement>('.party-sheets-tab a[mat-flat-button]');
    expect(cta).toBeTruthy();
    expect(cta!.tagName).toBe('A');
  });

  it('joueur ayant déjà un personnage sur cette partie → onglet par défaut "Détails", pas de bouton de création dans "Ma fiche"', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const character = makeCharacterDto({ userId: PLAYER_ID, partieId: 'party-1' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
      characters: [character],
    });

    const comp = fixture.componentInstance as unknown as { selectedTabIndex: () => number };
    expect(comp.selectedTabIndex()).toBe(0);

    const maFicheTab = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).find(
      (t) => t.textContent?.trim() === 'Fiches',
    );
    maFicheTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeFalsy();
  });

  it('système sans module → onglet par défaut "Détails" ; bouton absent de "Ma fiche" même sans personnage (gating corrigé)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis', status: 'EN_COURS' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
    });

    const comp = fixture.componentInstance as unknown as { selectedTabIndex: () => number };
    expect(comp.selectedTabIndex()).toBe(0);

    const maFicheTab = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).find(
      (t) => t.textContent?.trim() === 'Fiches',
    );
    maFicheTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeFalsy();
    expect(el.querySelector('.party-sheets-tab .muted')?.textContent?.trim()).toBeTruthy();
  });

  it('partie terminée → onglet par défaut "Détails" ; bouton absent de "Ma fiche" même sans personnage (gating corrigé)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'TERMINEE' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
    });

    const comp = fixture.componentInstance as unknown as { selectedTabIndex: () => number };
    expect(comp.selectedTabIndex()).toBe(0);

    const maFicheTab = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).find(
      (t) => t.textContent?.trim() === 'Fiches',
    );
    maFicheTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeFalsy();
  });

  it('le MJ reste sur "Détails" par défaut, même sur un système avec module et une partie ouverte (inchangé)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const { fixture } = await createFixture(partie, MJ_ID, { desktop: true, noopAnimations: true });

    const comp = fixture.componentInstance as unknown as { selectedTabIndex: () => number };
    expect(comp.selectedTabIndex()).toBe(0);
  });

  it("slot d'initiale du roster desktop (isSelf sans personnage) : aria-label/tooltip thématisé depuis roster.create_slot_label", async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const members: PartieMemberDto[] = [
      {
        userId: MJ_ID,
        pseudo: 'Sylas',
        displayName: 'Sylas',
        email: 'sylas@test.com',
        joinedAt: '',
      },
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Alice au pays',
        email: 'alice@test.com',
        joinedAt: '',
      },
    ];
    const { el } = await createFixture(partie, PLAYER_ID, { members, desktop: true });

    const slot = el.querySelector<HTMLElement>(`[data-user-id="${PLAYER_ID}"]`);
    expect(slot).toBeTruthy();
    const expected = TONE_MAP['grimoire-emeraude']['roster.create_slot_label'];
    expect(slot!.getAttribute('aria-label')).toBe(`Alice au pays — ${expected}`);
    expect(slot!.getAttribute('title')).toBe(`Alice au pays — ${expected}`);
  });

  it("système sans module → slot roster de l'utilisateur courant non actionnable (tabindex -1, aria-label générique, pas le libellé de création) (bmad-review, 2026-09-21)", async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis', status: 'EN_COURS' });
    const members: PartieMemberDto[] = [
      {
        userId: MJ_ID,
        pseudo: 'Sylas',
        displayName: 'Sylas',
        email: 'sylas@test.com',
        joinedAt: '',
      },
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Alice au pays',
        email: 'alice@test.com',
        joinedAt: '',
      },
    ];
    const { el } = await createFixture(partie, PLAYER_ID, { members, desktop: true });

    const slot = el.querySelector<HTMLElement>(`[data-user-id="${PLAYER_ID}"]`);
    expect(slot).toBeTruthy();
    expect(slot!.getAttribute('tabindex')).toBe('-1');
    expect(slot!.getAttribute('aria-label')).toBe('Alice au pays — aucun personnage créé');
    expect(slot!.querySelector('.roster-rail__create-badge')).toBeNull();
  });

  it("échec réseau de listByPartie() → charactersLoaded() devient quand même true, canCreateCharacter()/l'atterrissage se résolvent normalement (bmad-review, 2026-09-21)", async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
      charactersPromise: Promise.reject(new Error('network down')),
    });

    const comp = fixture.componentInstance as unknown as {
      selectedTabIndex: () => number;
      charactersLoaded: () => boolean;
    };
    expect(comp.charactersLoaded()).toBe(true);
    expect(comp.selectedTabIndex()).toBe(1);
    const activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Fiches');
    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeTruthy();
  });

  it("navigation manuelle vers « Ma fiche » pendant le chargement de characters() → indicateur de chargement, jamais le message vide ni le bouton, indiscernables de l'état « on ne peut jamais créer ici » (bmad-review, 2026-09-21)", async () => {
    let resolveCharacters!: (chars: CharacterDto[]) => void;
    const charactersPromise = new Promise<CharacterDto[]>((resolve) => {
      resolveCharacters = resolve;
    });
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, {
      desktop: true,
      noopAnimations: true,
      charactersPromise,
    });

    // MatTabGroup ne rend le corps que de l'onglet actif (cf. Implementation Notes de la story
    // 29.15) — pendant le chargement, l'atterrissage par défaut reste « Détails », donc le corps de
    // « Ma fiche » n'existe pas encore tant que rien ne le sélectionne. On reproduit ici exactement
    // le cas visé (navigation manuelle du joueur avant la fin du chargement), pas l'atterrissage
    // automatique (déjà couvert par les tests de flicker ci-dessus).
    const maFicheTab = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).find(
      (t) => t.textContent?.trim() === 'Fiches',
    );
    maFicheTab?.click();
    fixture.detectChanges();

    expect(el.querySelector('.party-sheets-tab mat-progress-spinner')).toBeTruthy();
    expect(el.querySelector('.party-sheets-tab .muted')).toBeNull();
    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeNull();

    resolveCharacters([]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.party-sheets-tab mat-progress-spinner')).toBeNull();
    expect(el.querySelector('.party-sheets-tab a[mat-flat-button]')).toBeTruthy();
  });

  it("un personnage créé ailleurs et rechargé via le signal temps réel ne fait plus basculer l'onglet hors de « Ma fiche » une fois l'atterrissage stabilisé (bmad-review, 2026-09-21 : gel tabSettled)", async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', status: 'EN_COURS' });
    const changed = signal(0);
    const newCharacter = makeCharacterDto({ id: 'char-x', userId: PLAYER_ID, partieId: partie.id });
    let callCount = 0;
    const listByPartie = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? [] : [newCharacter]);
    });

    await TestBed.configureTestingModule({
      imports: [PartieDetail],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => partie.id },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: AuthService, useValue: makeAuthService(PLAYER_ID) },
        { provide: PartiesService, useValue: makePartiesService(partie, [], []) },
        { provide: BreakpointObserver, useValue: makeBreakpointObserver(true) },
        {
          provide: MyPartiesService,
          useValue: { refreshMjParties: vi.fn(), playerParties: signal([]) },
        },
        { provide: AvailabilityService, useValue: { notifyChanged: vi.fn() } },
        {
          provide: CharacterService,
          useValue: {
            listByPartie,
            getGameSystemContent: vi.fn().mockResolvedValue(null),
            changed,
          },
        },
        { provide: ThemeToneService, useValue: makeToneService() },
        { provide: ScenariosService, useValue: makeScenariosService() },
        {
          provide: AnnouncementsService,
          useValue: { create: vi.fn(), listAll: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
        {
          provide: UnseenAnnouncementsService,
          useValue: { unseenAnnouncements: signal([]), markRead: vi.fn() },
        },
        {
          provide: HommeDragonService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
            update: vi.fn(),
            changed: signal(0),
          },
        },
        {
          provide: CharacterRolesService,
          useValue: { listForPartie: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PartieDetail);
    fixture.detectChanges();
    for (let i = 0; i < 15; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    let activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Fiches');

    // Signal temps réel : characterSvc.changed() déclenche reloadCharacters(), qui révèle
    // désormais un personnage — canCreateCharacter() bascule à `false`, mais l'onglet ne doit
    // plus bouger (déjà stabilisé une fois, cf. l'effet `tabSettled` de partie-detail.ts).
    changed.update((v) => v + 1);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Fiches');
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
      {
        userId: MJ_ID,
        pseudo: 'Sylas',
        displayName: 'Sylas',
        email: 'sylas@test.com',
        joinedAt: '',
      },
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Alice au pays',
        email: 'alice@test.com',
        joinedAt: '',
      },
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

describe('PartieDetail — autocomplétion des invitations (Story 32.1)', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  /** Même discipline de vidage de microtâches que `createFixture()` (ngOnInit enchaîne plusieurs
   *  `await` sur des mocks) — nécessaire ici aussi pour laisser l'`effect()` de debounce et la
   *  promesse de `runSearch()` (mock résolu) se propager jusqu'aux signaux `results`/`search`. */
  async function flush(fixture: ComponentFixture<PartieDetail>): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it("sous le seuil minimal (1 caractère) : aucune requête HTTP n'est émise, results vidé", async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID);
    vi.useFakeTimers();
    const parties = TestBed.inject(PartiesService) as unknown as {
      searchUsers: ReturnType<typeof vi.fn>;
    };
    parties.searchUsers.mockClear();

    fixture.componentInstance['search'].set('a');
    await flush(fixture);
    vi.advanceTimersByTime(1000);
    await flush(fixture);

    expect(parties.searchUsers).not.toHaveBeenCalled();
    expect(fixture.componentInstance['results']()).toEqual([]);
  });

  it('au-dessus du seuil (2 caractères) : la recherche se déclenche automatiquement 500 ms après la frappe', async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID);
    vi.useFakeTimers();
    const parties = TestBed.inject(PartiesService) as unknown as {
      searchUsers: ReturnType<typeof vi.fn>;
    };
    parties.searchUsers.mockClear();
    parties.searchUsers.mockResolvedValue([{ id: 'u9', pseudo: 'Zed' }]);

    fixture.componentInstance['search'].set('ze');
    await flush(fixture);
    expect(parties.searchUsers).not.toHaveBeenCalled(); // pas encore écoulé les 500 ms

    vi.advanceTimersByTime(499);
    await flush(fixture);
    expect(parties.searchUsers).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flush(fixture);

    expect(parties.searchUsers).toHaveBeenCalledWith('ze');
    expect(fixture.componentInstance['results']()).toEqual([{ id: 'u9', pseudo: 'Zed' }]);
  });

  it("une nouvelle frappe avant l'expiration du délai réarme le debounce (un seul appel, avec la dernière valeur)", async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID);
    vi.useFakeTimers();
    const parties = TestBed.inject(PartiesService) as unknown as {
      searchUsers: ReturnType<typeof vi.fn>;
    };
    parties.searchUsers.mockClear();

    fixture.componentInstance['search'].set('al');
    await flush(fixture);
    vi.advanceTimersByTime(300);
    await flush(fixture);
    fixture.componentInstance['search'].set('ali');
    await flush(fixture);
    vi.advanceTimersByTime(500);
    await flush(fixture);

    expect(parties.searchUsers).toHaveBeenCalledTimes(1);
    expect(parties.searchUsers).toHaveBeenCalledWith('ali');
  });

  it("déclenchement manuel (runSearch(), bouton/(keyup.enter)) avec une saisie d'1 caractère : aucun appel réseau, results vidé", async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID);
    vi.useFakeTimers();
    const parties = TestBed.inject(PartiesService) as unknown as {
      searchUsers: ReturnType<typeof vi.fn>;
    };
    parties.searchUsers.mockClear();

    fixture.componentInstance['search'].set('a');
    await flush(fixture);
    await fixture.componentInstance['runSearch']();
    await flush(fixture);

    expect(parties.searchUsers).not.toHaveBeenCalled();
    expect(fixture.componentInstance['results']()).toEqual([]);
  });

  it('un déclenchement manuel annule le minuteur de debounce en attente (pas de second appel redondant ~500 ms plus tard)', async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID);
    vi.useFakeTimers();
    const parties = TestBed.inject(PartiesService) as unknown as {
      searchUsers: ReturnType<typeof vi.fn>;
    };
    parties.searchUsers.mockClear();
    parties.searchUsers.mockResolvedValue([]);

    fixture.componentInstance['search'].set('al');
    await flush(fixture);
    await fixture.componentInstance['runSearch']();
    await flush(fixture);
    expect(parties.searchUsers).toHaveBeenCalledTimes(1);

    // Le minuteur programmé par l'effect() de debounce doit avoir été annulé par runSearch() —
    // sans ce nettoyage, un second appel redondant partait ~500 ms plus tard.
    vi.advanceTimersByTime(500);
    await flush(fixture);

    expect(parties.searchUsers).toHaveBeenCalledTimes(1);
  });

  it("une réponse plus ancienne ne doit jamais écraser des résultats plus récents (Story 32.1, revue de code)", async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID);
    vi.useFakeTimers();
    const parties = TestBed.inject(PartiesService) as unknown as {
      searchUsers: ReturnType<typeof vi.fn>;
    };
    parties.searchUsers.mockClear();

    let resolveStale!: (v: { id: string; pseudo: string }[]) => void;
    const stale = new Promise<{ id: string; pseudo: string }[]>((res) => {
      resolveStale = res;
    });
    parties.searchUsers.mockImplementationOnce(() => stale);

    fixture.componentInstance['search'].set('al');
    await flush(fixture);
    vi.advanceTimersByTime(500);
    await flush(fixture);
    expect(parties.searchUsers).toHaveBeenCalledWith('al');

    // Avant que la réponse (périmée) de 'al' ne résolve, l'utilisateur tape 'ali' et déclenche
    // manuellement une recherche fraîche, qui résout immédiatement.
    parties.searchUsers.mockResolvedValueOnce([{ id: 'fresh', pseudo: 'Alice' }]);
    fixture.componentInstance['search'].set('ali');
    await flush(fixture);
    await fixture.componentInstance['runSearch']();
    await flush(fixture);
    expect(fixture.componentInstance['results']()).toEqual([{ id: 'fresh', pseudo: 'Alice' }]);

    // La réponse périmée ('al') résout après coup : elle ne doit jamais écraser les résultats frais.
    resolveStale([{ id: 'stale', pseudo: 'Alan' }]);
    await flush(fixture);

    expect(fixture.componentInstance['results']()).toEqual([{ id: 'fresh', pseudo: 'Alice' }]);
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

// ─── Distribution d'XP (Story 6.2) ────────────────────────────────────────

describe('PartieDetail — distribution d’XP', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('bouton "Distribuer de l’XP" visible pour le MJ uniquement', async () => {
    const partie = makePartie({ mjId: MJ_ID });

    const { el: elMj } = await createFixture(partie, MJ_ID);
    const buttons = Array.from(elMj.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('XP'),
    );
    expect(buttons.length).toBeGreaterThan(0);
    TestBed.resetTestingModule();

    const { el: elPlayer } = await createFixture(partie, PLAYER_ID);
    const playerButtons = Array.from(elPlayer.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('XP'),
    );
    expect(playerButtons.length).toBe(0);
  });

  it('section historique chargée seulement pour le MJ', async () => {
    const partie = makePartie({ mjId: MJ_ID });
    await createFixture(partie, MJ_ID);
    const parties = TestBed.inject(PartiesService) as unknown as {
      listXpDistributions: ReturnType<typeof vi.fn>;
    };
    expect(parties.listXpDistributions).toHaveBeenCalledWith('party-1');
    TestBed.resetTestingModule();

    await createFixture(partie, PLAYER_ID);
    const partiesPlayer = TestBed.inject(PartiesService) as unknown as {
      listXpDistributions: ReturnType<typeof vi.fn>;
    };
    expect(partiesPlayer.listXpDistributions).not.toHaveBeenCalled();
  });

  it('après distributed(), characters()/xpDistributions() sont rechargés', async () => {
    const partie = makePartie({ mjId: MJ_ID });
    const { fixture } = await createFixture(partie, MJ_ID, {
      characters: [makeCharacterDto({ id: 'c1' })],
    });
    const characters = TestBed.inject(CharacterService) as unknown as {
      listByPartie: ReturnType<typeof vi.fn>;
    };
    const parties = TestBed.inject(PartiesService) as unknown as {
      listXpDistributions: ReturnType<typeof vi.fn>;
    };
    characters.listByPartie.mockClear();
    parties.listXpDistributions.mockClear();

    const component = fixture.componentInstance as unknown as {
      onXpDistributed: () => Promise<void>;
    };
    await component.onXpDistributed();

    expect(characters.listByPartie).toHaveBeenCalledWith('party-1');
    expect(parties.listXpDistributions).toHaveBeenCalledWith('party-1');
  });
});

describe('PartieDetail — publication d’annonce (Story 9.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('bouton de publication d’annonce visible pour le MJ, absent pour un joueur (AC6)', async () => {
    const partie = makePartie({ mjId: MJ_ID });

    const { el: elMj } = await createFixture(partie, MJ_ID);
    expect(elMj.querySelector('.announcement-section')).toBeTruthy();
    TestBed.resetTestingModule();

    const { el: elPlayer } = await createFixture(partie, PLAYER_ID);
    expect(elPlayer.querySelector('.announcement-section')).toBeFalsy();
  });

  it('le panel reste ouvert après publication (revue de code : le MJ voit la confirmation avant de fermer lui-même)', async () => {
    const partie = makePartie({ mjId: MJ_ID });
    const { fixture } = await createFixture(partie, MJ_ID);

    const component = fixture.componentInstance as unknown as {
      showAnnouncementForm: WritableSignal<boolean>;
    };
    component.showAnnouncementForm.set(true);
    fixture.detectChanges();

    expect(component.showAnnouncementForm()).toBe(true);
  });
});

describe('PartieDetail — consultation des annonces « toute la campagne » (Story 9.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC1 : affiche les annonces scenarioId: null, triées (ordre déjà renvoyé par le backend)', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const announcements = [
      makeAnnouncementDto({ id: 'ann-recent', text: 'La plus récente' }),
      makeAnnouncementDto({ id: 'ann-ancien', text: 'La plus ancienne' }),
    ];

    const { el } = await createFixture(partie, MJ_ID, { announcements });

    const feed = el.querySelector('.announcements-feed');
    expect(feed).toBeTruthy();
    expect(feed!.textContent).toContain('La plus récente');
    expect(feed!.textContent).toContain('La plus ancienne');
  });

  it("une annonce scopée à un scénario n'apparaît jamais dans ce flux (filtrée côté client)", async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const announcements = [
      makeAnnouncementDto({ id: 'ann-campagne', text: 'Annonce campagne', scenarioId: null }),
      makeAnnouncementDto({ id: 'ann-scenario', text: 'Annonce scénario', scenarioId: 's1' }),
    ];

    const { el } = await createFixture(partie, MJ_ID, { announcements });

    const feed = el.querySelector('.announcements-feed');
    expect(feed!.textContent).toContain('Annonce campagne');
    expect(feed!.textContent).not.toContain('Annonce scénario');
  });

  it('libellé « Ce one-shot » pour une Partie ONE_SHOT, « Toute la campagne » sinon', async () => {
    const oneShot = makePartie({ mjId: MJ_ID, kind: 'ONE_SHOT' });
    const { el: elOneShot } = await createFixture(oneShot, MJ_ID, {
      announcements: [makeAnnouncementDto()],
    });
    expect(elOneShot.querySelector('.announcements-feed')!.textContent).toContain('Cette quête');
    TestBed.resetTestingModule();

    const campagne = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { el: elCampagne } = await createFixture(campagne, MJ_ID, {
      announcements: [makeAnnouncementDto()],
    });
    expect(elCampagne.querySelector('.announcements-feed')!.textContent).toContain(
      'Toute la campagne',
    );
  });

  it('visible pour un joueur, pas seulement le MJ', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { el } = await createFixture(partie, PLAYER_ID, {
      announcements: [makeAnnouncementDto({ text: 'Visible du joueur' })],
    });

    expect(el.querySelector('.announcements-feed')!.textContent).toContain('Visible du joueur');
  });

  it('publication réussie recharge la liste (announcementsSvc.listAll rappelé)', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { fixture } = await createFixture(partie, MJ_ID);
    const announcementsSvc = TestBed.inject(AnnouncementsService) as unknown as {
      listAll: ReturnType<typeof vi.fn>;
    };
    const callsBefore = announcementsSvc.listAll.mock.calls.length;

    const component = fixture.componentInstance as unknown as {
      onAnnouncementPublished: () => Promise<void>;
    };
    await component.onAnnouncementPublished();

    expect(announcementsSvc.listAll.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe('PartieDetail — marquage « vue » des annonces de campagne sur clic explicite (Story 29.13, révision)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("une annonce non vue affichée n'appelle jamais markRead() tant qu'elle n'est pas cliquée", async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const announcements = [makeAnnouncementDto({ id: 'ann-non-vue', text: 'Non vue' })];
    const markAnnouncementRead = vi.fn().mockResolvedValue(undefined);

    await createFixture(partie, MJ_ID, {
      announcements,
      unseenAnnouncementIds: ['ann-non-vue'],
      markAnnouncementRead,
    });

    expect(markAnnouncementRead).not.toHaveBeenCalled();
  });

  it('un clic sur une annonce non vue déclenche markRead() avec le bon id', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const announcements = [makeAnnouncementDto({ id: 'ann-non-vue', text: 'Non vue' })];
    const markAnnouncementRead = vi.fn().mockResolvedValue(undefined);

    const { fixture, el } = await createFixture(partie, MJ_ID, {
      announcements,
      unseenAnnouncementIds: ['ann-non-vue'],
      markAnnouncementRead,
    });

    el.querySelector('app-annonce-card article')?.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(markAnnouncementRead).toHaveBeenCalledWith('ann-non-vue');
  });

  it('un clic sur une annonce déjà vue (absente des non-vues) ne déclenche aucun appel', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const announcements = [makeAnnouncementDto({ id: 'ann-deja-vue', text: 'Déjà vue' })];
    const markAnnouncementRead = vi.fn().mockResolvedValue(undefined);

    const { fixture, el } = await createFixture(partie, MJ_ID, {
      announcements,
      unseenAnnouncementIds: [],
      markAnnouncementRead,
    });

    el.querySelector('app-annonce-card article')?.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(markAnnouncementRead).not.toHaveBeenCalled();
  });
});

describe('PartieDetail — arrivée depuis le bandeau du Shell (Story 29.13, révision du 2026-08-13)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('force l\'onglet "Détails" même quand un autre onglet serait sélectionné par défaut (joueur mobile)', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    // gameSystemId: 'ryuutama' (avec module) — sans forçage, ce joueur sans personnage atterrit
    // sur "Ma fiche" (index 1, Story 29.15) ; le test vérifie que le forçage du bandeau l'emporte.
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE', gameSystemId: 'ryuutama' });
    const announcements = [makeAnnouncementDto({ id: 'ann-cible', scenarioId: null })];

    const { fixture } = await createFixture(partie, 'player-1', {
      announcements,
      unseenAnnouncementIds: ['ann-cible'],
      announcementIdQueryParam: 'ann-cible',
      desktop: false,
      noopAnimations: true,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.componentInstance as any).selectedTabIndex()).toBe(0);
  });

  it("fait défiler jusqu'à l'AnnonceCard visée et la met en évidence", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const announcements = [makeAnnouncementDto({ id: 'ann-cible', scenarioId: null })];

    const { fixture, el } = await createFixture(partie, MJ_ID, {
      announcements,
      unseenAnnouncementIds: ['ann-cible'],
      announcementIdQueryParam: 'ann-cible',
      noopAnimations: true,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    // scrollToAnnouncement() retente via requestAnimationFrame jusqu'à trouver l'élément.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }

    const target = el.querySelector('#announcement-ann-cible');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(target?.classList.contains('annonce-card--highlight')).toBe(true);
  });

  it("n'interfère pas quand aucun announcementId n'est présent dans l'URL", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });

    await createFixture(partie, MJ_ID, { noopAnimations: true });

    expect(scrollSpy).not.toHaveBeenCalled();
  });
});

describe('PartieDetail — onglet Scénario(s) (Story 7.4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('Partie ONE_SHOT + MJ → onglet "Scénario" (singulier), app-scenario-one-shot-tab, jamais app-scenario-drafts', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'ONE_SHOT' });
    const { fixture, el } = await createFixture(partie, MJ_ID, { noopAnimations: true });

    const tabLabels = el.querySelectorAll<HTMLElement>('div[role="tab"]');
    const scenarioTab = Array.from(tabLabels).find((t) => t.textContent?.trim() === 'Scénario');
    expect(scenarioTab).toBeTruthy();
    scenarioTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('app-scenario-one-shot-tab')).toBeTruthy();
    expect(el.querySelector('app-scenario-drafts')).toBeNull();
  });

  it('Partie CAMPAGNE_LINEAIRE + MJ → onglet "Scénarios" (pluriel), app-scenario-drafts, jamais app-scenario-one-shot-tab', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { fixture, el } = await createFixture(partie, MJ_ID, { noopAnimations: true });

    const tabLabels = el.querySelectorAll<HTMLElement>('div[role="tab"]');
    const scenarioTab = Array.from(tabLabels).find((t) => t.textContent?.trim() === 'Scénarios');
    expect(scenarioTab).toBeTruthy();
    scenarioTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('app-scenario-drafts')).toBeTruthy();
    expect(el.querySelector('app-scenario-one-shot-tab')).toBeNull();
  });

  it('joueur (non-MJ) → aucun des deux onglets Scénario(s), quel que soit le kind', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { el } = await createFixture(partie, PLAYER_ID);
    expect(el.querySelector('app-scenario-drafts')).toBeNull();
    expect(el.querySelector('app-scenario-one-shot-tab')).toBeNull();
  });
});

describe('PartieDetail — onglet Chronologie (Story 7.5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('Partie CAMPAGNE_LINEAIRE + MJ → onglet "Chronologie" présent, app-scenario-timeline rendu au clic', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { fixture, el } = await createFixture(partie, MJ_ID, { noopAnimations: true });

    const tabLabels = el.querySelectorAll<HTMLElement>('div[role="tab"]');
    const chronoTab = Array.from(tabLabels).find((t) => t.textContent?.trim() === 'Chronologie');
    expect(chronoTab).toBeTruthy();
    chronoTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('app-scenario-timeline')).toBeTruthy();
  });

  it('Partie CAMPAGNE_LINEAIRE + joueur (non-MJ) → onglet "Chronologie" présent (visible à tout membre)', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { el } = await createFixture(partie, PLAYER_ID, { noopAnimations: true });

    const tabLabels = el.querySelectorAll<HTMLElement>('div[role="tab"]');
    const chronoTab = Array.from(tabLabels).find((t) => t.textContent?.trim() === 'Chronologie');
    expect(chronoTab).toBeTruthy();
  });

  it('Partie ONE_SHOT → onglet "Chronologie" absent (un ONE_SHOT n’a pas de timeline)', async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'ONE_SHOT' });
    const { el } = await createFixture(partie, MJ_ID);
    const tabLabels = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabLabels).not.toContain('Chronologie');
  });
});

describe('PartieDetail — onglet Homme Dragon (Story 10.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('MJ + Partie Ryuutama → onglet "Homme Dragon" présent, app-homme-dragon-sheet rendu au clic', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, MJ_ID, { noopAnimations: true });

    const tabLabels = el.querySelectorAll<HTMLElement>('div[role="tab"]');
    const hdTab = Array.from(tabLabels).find((t) => t.textContent?.trim() === 'Homme Dragon');
    expect(hdTab).toBeTruthy();
    hdTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('app-homme-dragon-sheet')).toBeTruthy();
  });

  it('joueur (non-MJ) → onglet "Homme Dragon" absent, même sur une Partie Ryuutama (AC3)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { el } = await createFixture(partie, PLAYER_ID);
    const tabLabels = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabLabels).not.toContain('Homme Dragon');
  });

  it('Partie non-Ryuutama → onglet "Homme Dragon" absent, même pour le MJ (AD-1/AD-5)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis' });
    const { el } = await createFixture(partie, MJ_ID);
    const tabLabels = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabLabels).not.toContain('Homme Dragon');
  });
});

describe('PartieDetail — fiches de référence (Story 12.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  // Story 29.15 : un joueur sans personnage sur un système avec module atterrit désormais sur
  // "Ma fiche" par défaut (même sur desktop) — les fiches de référence vivent dans "Détails", donc
  // chaque test de ce describe navigue explicitement vers cet onglet avant d'y chercher du contenu
  // (MatTabGroup ne rend le corps que de l'onglet actif/adjacent).
  async function goToDetailsTab(
    fixture: ComponentFixture<PartieDetail>,
    el: HTMLElement,
  ): Promise<void> {
    const detailsTab = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).find(
      (t) => t.textContent?.trim() === 'Détails',
    );
    detailsTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('Partie Ryuutama → section "Fiches de référence" présente, visible à tout membre (pas seulement au MJ)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, { noopAnimations: true });
    await goToDetailsTab(fixture, el);
    expect(el.querySelector('.reference-sheets')).toBeTruthy();
  });

  it('Partie non-Ryuutama → section "Fiches de référence" absente', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis' });
    const { el } = await createFixture(partie, PLAYER_ID);
    expect(el.querySelector('.reference-sheets')).toBeNull();
  });

  it('clic sur "Journal" → appelle getGameSystemAsset(partieId, gameSystemId, "journal") et déclenche un téléchargement', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, { noopAnimations: true });
    await goToDetailsTab(fixture, el);
    const characterSvc = TestBed.inject(CharacterService) as any;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

    const buttons = el.querySelectorAll<HTMLButtonElement>('.reference-sheets__links button');
    buttons[0].click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(characterSvc.getGameSystemAsset).toHaveBeenCalledWith(partie.id, 'ryuutama', 'journal');
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('clic sur "Carte" → appelle getGameSystemAsset(partieId, gameSystemId, "carte")', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, { noopAnimations: true });
    await goToDetailsTab(fixture, el);
    const characterSvc = TestBed.inject(CharacterService) as any;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

    const buttons = el.querySelectorAll<HTMLButtonElement>('.reference-sheets__links button');
    buttons[1].click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(characterSvc.getGameSystemAsset).toHaveBeenCalledWith(partie.id, 'ryuutama', 'carte');
  });

  it("échec du téléchargement → message d'erreur affiché, pas de plantage", async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, { noopAnimations: true });
    await goToDetailsTab(fixture, el);
    const characterSvc = TestBed.inject(CharacterService) as any;
    characterSvc.getGameSystemAsset.mockRejectedValueOnce(new Error('network down'));

    const buttons = el.querySelectorAll<HTMLButtonElement>('.reference-sheets__links button');
    buttons[0].click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(el.querySelector('.reference-sheets__error')).toBeTruthy();
  });

  it('les 2 boutons sont désactivés pendant un téléchargement en cours (revue de code : garde anti-double-clic)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, PLAYER_ID, { noopAnimations: true });
    await goToDetailsTab(fixture, el);
    const characterSvc = TestBed.inject(CharacterService) as any;
    let resolveDownload: (blob: Blob) => void;
    characterSvc.getGameSystemAsset.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        resolveDownload = resolve;
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

    const buttons = el.querySelectorAll<HTMLButtonElement>('.reference-sheets__links button');
    buttons[0].click();
    await Promise.resolve();
    fixture.detectChanges();

    const refreshedButtons = el.querySelectorAll<HTMLButtonElement>(
      '.reference-sheets__links button',
    );
    expect(refreshedButtons[0].disabled).toBe(true);
    expect(refreshedButtons[1].disabled).toBe(true);

    resolveDownload!(new Blob(['%PDF-1.6'], { type: 'application/pdf' }));
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  });
});

describe('PartieDetail — fiches de préparation MJ-only (Story 12.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('MJ + Partie Ryuutama → section "Fiches de préparation" présente avec les 8 liens', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { el } = await createFixture(partie, MJ_ID);
    const section = el.querySelector('.prep-sheets');
    expect(section).toBeTruthy();
    expect(section?.querySelectorAll('.prep-sheets__links button').length).toBe(8);
  });

  it('joueur (non-MJ) → section "Fiches de préparation" absente, même sur une Partie Ryuutama (AC2)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { el } = await createFixture(partie, PLAYER_ID);
    expect(el.querySelector('.prep-sheets')).toBeNull();
  });

  it('MJ + Partie non-Ryuutama → section "Fiches de préparation" absente', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis' });
    const { el } = await createFixture(partie, MJ_ID);
    expect(el.querySelector('.prep-sheets')).toBeNull();
  });

  it.each([
    ['monde', 0],
    ['monstre', 1],
    ['ville', 2],
    ['objectif-chasse', 3],
    ['objectif-quete', 4],
    ['objectif-voyage', 5],
    ['oeuf-de-bataille', 6],
    ['structure', 7],
  ])(
    'clic sur le lien #%s (index %i) → appelle getGameSystemAsset(partieId, "ryuutama", "%s")',
    async (key, index) => {
      const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
      const { fixture, el } = await createFixture(partie, MJ_ID);
      const characterSvc = TestBed.inject(CharacterService) as any;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

      const buttons = el.querySelectorAll<HTMLButtonElement>('.prep-sheets__links button');
      buttons[index as number].click();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      expect(characterSvc.getGameSystemAsset).toHaveBeenCalledWith(partie.id, 'ryuutama', key);
    },
  );
});

describe('PartieDetail — rechargement sur signal temps réel (Story 18.3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('la Partie éditée ailleurs (ex. gameSystemId) apparaît sans F5 quand un événement temps réel est reçu (AC1)', async () => {
    const initial = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis' });
    const updated = { ...initial, gameSystemId: 'ryuutama' };
    const changed = signal(0);
    const partiesSvc = {
      get: vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(updated),
      members: vi.fn().mockResolvedValue([]),
      inviteLinks: vi.fn().mockResolvedValue([]),
      searchUsers: vi.fn().mockResolvedValue([]),
      inviteUser: vi.fn(),
      inviteByEmail: vi.fn(),
      removeMember: vi.fn(),
      createInviteLink: vi.fn(),
      revokeInviteLink: vi.fn(),
      remove: vi.fn(),
      listXpDistributions: vi.fn().mockResolvedValue([]),
      createXpDistribution: vi.fn(),
      changed,
      notifyChanged: vi.fn(() => changed.update((v) => v + 1)),
    };

    await TestBed.configureTestingModule({
      imports: [PartieDetail],
      providers: [
        provideRouter([]),
        provideAnimationsAsync(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => initial.id },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: AuthService, useValue: makeAuthService(MJ_ID) },
        { provide: PartiesService, useValue: partiesSvc },
        { provide: BreakpointObserver, useValue: makeBreakpointObserver(true) },
        {
          provide: MyPartiesService,
          useValue: { refreshMjParties: vi.fn(), playerParties: signal([]) },
        },
        { provide: AvailabilityService, useValue: { notifyChanged: vi.fn() } },
        {
          provide: CharacterService,
          useValue: {
            listByPartie: vi.fn().mockResolvedValue([]),
            getGameSystemContent: vi.fn().mockResolvedValue({}),
            changed: signal(0),
          },
        },
        { provide: ThemeToneService, useValue: makeToneService() },
        { provide: ScenariosService, useValue: makeScenariosService([]) },
        {
          provide: AnnouncementsService,
          useValue: { create: vi.fn(), listAll: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
        {
          provide: HommeDragonService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
            update: vi.fn(),
            // Story 20.2 (Task 3) : HommeDragonSheet (rendu transitivement) réagit désormais à ce signal.
            changed: signal(0),
          },
        },
        {
          provide: CharacterRolesService,
          useValue: { listForPartie: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
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
    const el = fixture.nativeElement as HTMLElement;

    expect(
      Array.from(el.querySelectorAll('div[role="tab"]')).map((t) => t.textContent?.trim()),
    ).not.toContain('Homme Dragon');

    // Revue de code Story 18.3 : déclenche un vrai événement SSE (pas un appel direct à
    // notifyChanged()) — exerce la chaîne complète EventSource -> RealtimeService.onSignal ->
    // matchingHandlers -> PartiesService.notifyChanged() -> effect() de PartieDetail, jamais
    // couverte de bout en bout auparavant (chaque maillon n'était testé qu'isolément).
    const es = FakeEventSource.instances.find((i) => i.url.includes(initial.id));
    expect(es).toBeDefined();
    es!.emit('message');
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();

    expect(partiesSvc.get).toHaveBeenCalledTimes(2);
    expect(
      Array.from(el.querySelectorAll('div[role="tab"]')).map((t) => t.textContent?.trim()),
    ).toContain('Homme Dragon');
  });

  it('AC2 : le patch visibilitychange est retiré — un dispatch manuel ne déclenche plus aucun rechargement', async () => {
    const initial = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis' });
    const { fixture, el } = await createFixture(initial, MJ_ID);
    const partiesSvcSpy = TestBed.inject(PartiesService) as unknown as {
      get: ReturnType<typeof vi.fn>;
    };
    const callsBefore = partiesSvcSpy.get.mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();

    expect(partiesSvcSpy.get.mock.calls.length).toBe(callsBefore);
    expect(el).toBeTruthy();
  });

  it('bug fix : un CharacterService.changed() (personnage créé par un joueur) recharge le roster sans reload', async () => {
    const initial = makePartie({ mjId: MJ_ID });
    const { fixture } = await createFixture(initial, MJ_ID);
    const characterSvc = TestBed.inject(CharacterService) as unknown as {
      listByPartie: ReturnType<typeof vi.fn>;
      changed: WritableSignal<number>;
    };
    const newCharacter = makeCharacterDto({ id: 'c1', userId: PLAYER_ID });
    characterSvc.listByPartie.mockResolvedValue([newCharacter]);
    const callsBefore = characterSvc.listByPartie.mock.calls.length;

    characterSvc.changed.set(1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(characterSvc.listByPartie.mock.calls.length).toBe(callsBefore + 1);
  });

  it('bug fix (revue de code) : un échec réseau transitoire du rechargement de roster ne vide pas la liste affichée', async () => {
    const initial = makePartie({ mjId: MJ_ID });
    const { fixture } = await createFixture(initial, MJ_ID);
    const characterSvc = TestBed.inject(CharacterService) as unknown as {
      listByPartie: ReturnType<typeof vi.fn>;
      changed: WritableSignal<number>;
    };
    const existing = makeCharacterDto({ id: 'c1', userId: PLAYER_ID });
    characterSvc.listByPartie.mockResolvedValueOnce([existing]);

    characterSvc.changed.set(1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    const comp = fixture.componentInstance as unknown as { characters: () => unknown[] };
    expect(comp.characters()).toEqual([existing]);

    characterSvc.listByPartie.mockRejectedValueOnce(new Error('réseau'));
    characterSvc.changed.set(2);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(comp.characters()).toEqual([existing]);
  });

  it('charge les rôles de groupe assignés via CharacterRolesService.listForPartie (Story 27.3, AC1)', async () => {
    const partie = makePartie({ mjId: MJ_ID });
    await createFixture(partie, MJ_ID);

    const characterRolesSvc = TestBed.inject(CharacterRolesService) as unknown as {
      listForPartie: ReturnType<typeof vi.fn>;
    };
    expect(characterRolesSvc.listForPartie).toHaveBeenCalledWith('party-1');
  });

  it('un CharacterRolesService.changed() (rôle assigné/retiré par le MJ) recharge characterRoles (Story 27.3, AC3)', async () => {
    const initial = makePartie({ mjId: MJ_ID });
    const { fixture } = await createFixture(initial, MJ_ID);
    const characterRolesSvc = TestBed.inject(CharacterRolesService) as unknown as {
      listForPartie: ReturnType<typeof vi.fn>;
      changed: WritableSignal<number>;
    };
    const role: CharacterGroupRoleDto = {
      id: 'role1',
      characterId: 'c1',
      partieId: 'party-1',
      roleKey: 'cartographe',
      assignedAt: '2026-01-01T00:00:00.000Z',
    };
    characterRolesSvc.listForPartie.mockResolvedValue([role]);
    const callsBefore = characterRolesSvc.listForPartie.mock.calls.length;

    characterRolesSvc.changed.set(1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(characterRolesSvc.listForPartie.mock.calls.length).toBe(callsBefore + 1);
    const comp = fixture.componentInstance as unknown as { characterRoles: () => unknown[] };
    expect(comp.characterRoles()).toEqual([role]);
  });

  it('garde firstRun : un CharacterService.changed() déjà non-nul au montage ne déclenche PAS de refetch redondant', async () => {
    const initial = makePartie({ mjId: MJ_ID });
    await TestBed.configureTestingModule({
      imports: [PartieDetail],
      providers: [
        provideRouter([]),
        provideAnimationsAsync(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => initial.id },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: AuthService, useValue: makeAuthService(MJ_ID) },
        { provide: PartiesService, useValue: makePartiesService(initial) },
        { provide: BreakpointObserver, useValue: makeBreakpointObserver(true) },
        {
          provide: MyPartiesService,
          useValue: { refreshMjParties: vi.fn(), playerParties: signal([]) },
        },
        { provide: AvailabilityService, useValue: { notifyChanged: vi.fn() } },
        {
          provide: CharacterService,
          useValue: {
            listByPartie: vi.fn().mockResolvedValue([]),
            getGameSystemContent: vi.fn().mockResolvedValue({}),
            changed: signal(1),
          },
        },
        { provide: ThemeToneService, useValue: makeToneService() },
        { provide: ScenariosService, useValue: makeScenariosService() },
        {
          provide: AnnouncementsService,
          useValue: { create: vi.fn(), listAll: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
        {
          provide: CharacterRolesService,
          useValue: { listForPartie: vi.fn().mockResolvedValue([]), changed: signal(0) },
        },
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

    const characterSvc = TestBed.inject(CharacterService) as unknown as {
      listByPartie: ReturnType<typeof vi.fn>;
    };
    expect(characterSvc.listByPartie.mock.calls.length).toBe(1);
  });

  it('bug fix : un PartiesService.changed() (invitation acceptée par un joueur) recharge la liste des membres sans reload', async () => {
    const initial = makePartie({ mjId: MJ_ID });
    const { fixture } = await createFixture(initial, MJ_ID);
    const partiesSvc = TestBed.inject(PartiesService) as unknown as {
      members: ReturnType<typeof vi.fn>;
      notifyChanged: () => void;
    };
    const callsBefore = partiesSvc.members.mock.calls.length;

    partiesSvc.notifyChanged();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();

    expect(partiesSvc.members.mock.calls.length).toBe(callsBefore + 1);
  });
});

// ─── Alerte d'homonymie (Story 28.3, AC1/AC2) ─────────────────────────────

describe("PartieDetail — alerte d'homonymie", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('deux membres avec le même displayName → avertissement visible (AC1)', async () => {
    const members: PartieMemberDto[] = [
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Même Nom',
        email: 'a@test.com',
        joinedAt: '',
      },
      {
        userId: 'other',
        pseudo: 'Bob',
        displayName: 'Même Nom',
        email: 'b@test.com',
        joinedAt: '',
      },
    ];
    const { el } = await createFixture(makePartie(), PLAYER_ID, {
      members,
      displayName: 'Même Nom',
    });
    expect(el.querySelector('.homonymy-warning')).toBeTruthy();
  });

  it("Revue de code : le bandeau porte role=alert et aria-live=polite (annoncé aux lecteurs d'écran)", async () => {
    const members: PartieMemberDto[] = [
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Même Nom',
        email: 'a@test.com',
        joinedAt: '',
      },
      {
        userId: 'other',
        pseudo: 'Bob',
        displayName: 'Même Nom',
        email: 'b@test.com',
        joinedAt: '',
      },
    ];
    const { el } = await createFixture(makePartie(), PLAYER_ID, {
      members,
      displayName: 'Même Nom',
    });
    const banner = el.querySelector('.homonymy-warning');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
  });

  it('le displayName du joueur courant identique à celui du MJ (absent de members()) → avertissement visible (AC1)', async () => {
    const partie = makePartie({ mjId: MJ_ID, mjDisplayName: 'Même Nom' });
    const members: PartieMemberDto[] = [
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Même Nom',
        email: 'a@test.com',
        joinedAt: '',
      },
    ];
    const { el } = await createFixture(partie, PLAYER_ID, {
      members,
      displayName: 'Même Nom',
    });
    expect(el.querySelector('.homonymy-warning')).toBeTruthy();
  });

  it('aucun homonyme → aucun avertissement', async () => {
    const members: PartieMemberDto[] = [
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Alice',
        email: 'a@test.com',
        joinedAt: '',
      },
      { userId: 'other', pseudo: 'Bob', displayName: 'Bob', email: 'b@test.com', joinedAt: '' },
    ];
    const { el } = await createFixture(makePartie(), PLAYER_ID, {
      members,
      displayName: 'Alice',
    });
    expect(el.querySelector('.homonymy-warning')).toBeFalsy();
  });

  it('clic "Ignorer" → l\'avertissement disparaît et sessionStorage est écrit avec la bonne clé (AC2)', async () => {
    const members: PartieMemberDto[] = [
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Même Nom',
        email: 'a@test.com',
        joinedAt: '',
      },
      {
        userId: 'other',
        pseudo: 'Bob',
        displayName: 'Même Nom',
        email: 'b@test.com',
        joinedAt: '',
      },
    ];
    const { fixture, el } = await createFixture(makePartie(), PLAYER_ID, {
      members,
      displayName: 'Même Nom',
    });
    expect(el.querySelector('.homonymy-warning')).toBeTruthy();

    const dismissBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.closest('.homonymy-warning'),
    ) as HTMLButtonElement;
    dismissBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.homonymy-warning')).toBeFalsy();
    expect(sessionStorage.getItem(`homonymy-dismissed:party-1:${PLAYER_ID}`)).toBe('1');
  });

  it("rechargement avec la clé déjà en sessionStorage → avertissement absent même si l'homonymie existe (AC2)", async () => {
    sessionStorage.setItem(`homonymy-dismissed:party-1:${PLAYER_ID}`, '1');
    const members: PartieMemberDto[] = [
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Même Nom',
        email: 'a@test.com',
        joinedAt: '',
      },
      {
        userId: 'other',
        pseudo: 'Bob',
        displayName: 'Même Nom',
        email: 'b@test.com',
        joinedAt: '',
      },
    ];
    const { el } = await createFixture(makePartie(), PLAYER_ID, {
      members,
      displayName: 'Même Nom',
    });
    expect(el.querySelector('.homonymy-warning')).toBeFalsy();
  });
});

// ─── Pseudo en complément dans les écrans sans personnage (Story 28.3, AC3) ────

describe('PartieDetail — pseudo en complément (gestion des membres)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('gestion des membres (onglet Invitations) : membres homonymes → pseudo affiché', async () => {
    // Revue de code : le MJ n'apparaît jamais dans `members()` — seuls des joueurs réels ici.
    const members: PartieMemberDto[] = [
      {
        userId: PLAYER_ID,
        pseudo: 'Alice',
        displayName: 'Même Nom',
        email: 'alice@test.com',
        joinedAt: '',
      },
      { userId: 'p2', pseudo: 'Bob', displayName: 'Même Nom', email: 'bob@test.com', joinedAt: '' },
    ];
    const { fixture, el } = await createFixture(makePartie(), MJ_ID, {
      members,
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

    const pseudos = el.querySelectorAll('.invite .identity-label__pseudo');
    expect(pseudos.length).toBe(2);
  });

  it("Revue de code (2026-08-06) : le badge « MJ » est toujours affiché sur l'auteur d'une annonce campagne", async () => {
    const partie = makePartie({ mjId: MJ_ID, kind: 'CAMPAGNE_LINEAIRE' });
    const { el } = await createFixture(partie, PLAYER_ID, {
      announcements: [makeAnnouncementDto({ scenarioId: null, authorDisplayName: 'MJ Nom' })],
    });

    const badge = el.querySelector('.announcements-feed .annonce-card__mj-badge');
    expect(badge).toBeTruthy();
    expect(badge!.textContent?.trim()).toBe('MJ');
  });
});

describe('PartieDetail — bandeau contextuel (Story 29.4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('le sous-titre porte le système de jeu et le type de partie (correction post-test)', async () => {
    const partie = makePartie({
      mjId: MJ_ID,
      name: 'Les Cendres de Kavaan',
      gameSystemId: 'draconis',
      kind: 'ONE_SHOT',
    });
    await createFixture(partie, MJ_ID);

    const contextualNav = TestBed.inject(ContextualNavService);
    expect(contextualNav.title()).toBe('Les Cendres de Kavaan');
    expect(contextualNav.subtitle()).toBe('Draconis · One-shot');
  });

  it('le sous-titre est identique pour le MJ et pour un joueur (plus de rôle dans le bandeau)', async () => {
    const partie = makePartie({
      mjId: MJ_ID,
      name: 'Les Cendres de Kavaan',
      gameSystemId: 'draconis',
      kind: 'ONE_SHOT',
    });
    await createFixture(partie, PLAYER_ID);

    const contextualNav = TestBed.inject(ContextualNavService);
    expect(contextualNav.title()).toBe('Les Cendres de Kavaan');
    expect(contextualNav.subtitle()).toBe('Draconis · One-shot');
  });
});

// ─── Clôture explicite d'une partie (Story 29.6) ──────────────────────────

describe('PartieDetail — clôture explicite (Story 29.6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('le MJ voit le bouton "Clôturer" quand status !== TERMINEE, jamais "Rouvrir"', async () => {
    const partie = makePartie({ mjId: MJ_ID, status: 'EN_COURS' });
    const { el } = await createFixture(partie, MJ_ID);
    const actions = el.querySelector('mat-card-actions');
    expect(actions!.textContent).toContain('Clore le grimoire');
    expect(actions!.textContent).not.toContain('Rouvrir le grimoire');
  });

  it('le MJ voit le bouton "Rouvrir" quand status === TERMINEE, jamais "Clôturer"', async () => {
    const partie = makePartie({ mjId: MJ_ID, status: 'TERMINEE' });
    const { el } = await createFixture(partie, MJ_ID);
    const actions = el.querySelector('mat-card-actions');
    expect(actions!.textContent).toContain('Rouvrir le grimoire');
    expect(actions!.textContent).not.toContain('Clore le grimoire');
  });

  it('un joueur ne voit ni le bouton "Clôturer" ni "Rouvrir" (actions MJ-only)', async () => {
    const partie = makePartie({ mjId: MJ_ID, status: 'EN_COURS' });
    const { el } = await createFixture(partie, PLAYER_ID);
    const actions = el.querySelector('mat-card-actions');
    expect(actions?.textContent ?? '').not.toContain('Clore le grimoire');
    expect(actions?.textContent ?? '').not.toContain('Rouvrir le grimoire');
  });

  it('clic sur "Clôturer" appelle PartiesService.close et met à jour partie() avec la réponse', async () => {
    const partie = makePartie({ mjId: MJ_ID, status: 'EN_COURS' });
    const { fixture, el } = await createFixture(partie, MJ_ID);
    const parties = TestBed.inject(PartiesService) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };

    const buttons = Array.from(el.querySelectorAll('mat-card-actions button'));
    const closeBtn = buttons.find((b) => b.textContent?.includes('Clore le grimoire')) as
      HTMLButtonElement | undefined;
    expect(closeBtn).toBeTruthy();
    closeBtn!.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(parties.close).toHaveBeenCalledWith('party-1');
    const component = fixture.componentInstance;
    expect((component as unknown as { partie: () => { status: string } }).partie().status).toBe(
      'TERMINEE',
    );
  });

  it('clic sur "Rouvrir" appelle PartiesService.reopen et met à jour partie() avec la réponse', async () => {
    const partie = makePartie({ mjId: MJ_ID, status: 'TERMINEE' });
    const { fixture, el } = await createFixture(partie, MJ_ID);
    const parties = TestBed.inject(PartiesService) as unknown as {
      reopen: ReturnType<typeof vi.fn>;
    };

    const buttons = Array.from(el.querySelectorAll('mat-card-actions button'));
    const reopenBtn = buttons.find((b) => b.textContent?.includes('Rouvrir le grimoire')) as
      HTMLButtonElement | undefined;
    expect(reopenBtn).toBeTruthy();
    reopenBtn!.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(parties.reopen).toHaveBeenCalledWith('party-1');
    const component = fixture.componentInstance;
    expect((component as unknown as { partie: () => { status: string } }).partie().status).toBe(
      'EN_COURS',
    );
  });

  it('le bandeau "partie terminée" est visible pour un joueur (pas seulement le MJ) quand status === TERMINEE', async () => {
    const partie = makePartie({ mjId: MJ_ID, status: 'TERMINEE' });
    const { el } = await createFixture(partie, PLAYER_ID);
    expect(el.querySelector('.closed-banner')).toBeTruthy();
  });

  it('le bandeau "partie terminée" est absent quand status !== TERMINEE', async () => {
    const partie = makePartie({ mjId: MJ_ID, status: 'EN_COURS' });
    const { el } = await createFixture(partie, MJ_ID);
    expect(el.querySelector('.closed-banner')).toBeFalsy();
  });
});

// ─── Story 32.2 : regroupement de l'onglet Détails en trois zones (Action/Consultation/Référence) ───

describe('PartieDetail — zones de l’onglet Détails (Story 32.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const ZONE_ACTION = '.details-zone--action';
  const ZONE_CONSULTATION = '.details-zone--consultation';
  const ZONE_REFERENCE = '.details-zone--reference';

  it('les trois titres de zone (Action/Consultation/Référence) sont rendus, thématisés via theme.tone()', async () => {
    const { el } = await createFixture(makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' }), MJ_ID);

    const tone = TONE_MAP['grimoire-emeraude'];
    expect(el.querySelector(`${ZONE_ACTION} .details-zone__title`)?.textContent?.trim()).toBe(
      tone['partie.details_zone_action'],
    );
    expect(
      el.querySelector(`${ZONE_CONSULTATION} .details-zone__title`)?.textContent?.trim(),
    ).toBe(tone['partie.details_zone_consultation']);
    expect(el.querySelector(`${ZONE_REFERENCE} .details-zone__title`)?.textContent?.trim()).toBe(
      tone['partie.details_zone_reference'],
    );
  });

  // Revue de code (Story 32.2) : l'ordre des zones est posé une fois pour toutes par le template
  // (aucune logique ne le fait dépendre d'isDesktop()) — un seul test paramétré sur desktop/mobile
  // documente que ce même ordre statique tient dans les deux gabarits, sans prétendre vérifier une
  // garantie mobile-spécifique qui n'existe pas dans le code (AC3 porte sur le CSS, pas sur l'ordre
  // DOM, qui est identique quel que soit isDesktop()).
  it.each([true, false])(
    'la zone Action précède la zone Consultation, elle-même avant la zone Référence, dans le flux du DOM (desktop=%s)',
    async (desktop) => {
      const { el } = await createFixture(makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' }), MJ_ID, {
        desktop,
      });

      const zones = Array.from(el.querySelectorAll('.details-zone'));
      expect(zones.length).toBe(3);
      const classNames = zones.map((z) => z.className);
      const actionIndex = classNames.findIndex((c) => c.includes('details-zone--action'));
      const consultationIndex = classNames.findIndex((c) => c.includes('details-zone--consultation'));
      const referenceIndex = classNames.findIndex((c) => c.includes('details-zone--reference'));

      expect(actionIndex).toBe(0);
      expect(actionIndex).toBeLessThan(consultationIndex);
      expect(consultationIndex).toBeLessThan(referenceIndex);
    },
  );

  it('MJ, système Ryuutama : la zone Action porte le widget séance, la distribution d’XP et la publication d’annonce', async () => {
    const { el } = await createFixture(makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' }), MJ_ID);

    const action = el.querySelector(ZONE_ACTION)!;
    expect(action.querySelector('.scheduling-widget')).toBeTruthy();
    expect(action.querySelector('.xp-section')).toBeTruthy();
    expect(action.querySelector('.announcement-section')).toBeTruthy();
    // L'historique d'XP n'est plus dans la zone Action (extrait vers Consultation).
    expect(action.querySelector('app-xp-history')).toBeNull();
  });

  it('MJ, système Ryuutama : la zone Consultation porte le fil d’annonces et l’historique d’XP (extrait de la zone Action)', async () => {
    const announcements = [makeAnnouncementDto({ id: 'ann-1', scenarioId: null })];
    const { el } = await createFixture(
      makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', kind: 'CAMPAGNE_LINEAIRE' }),
      MJ_ID,
      { announcements },
    );

    const consultation = el.querySelector(ZONE_CONSULTATION)!;
    expect(consultation.querySelector('.announcements-feed')).toBeTruthy();
    expect(consultation.querySelector('app-xp-history')).toBeTruthy();
  });

  it('MJ, système Ryuutama : la zone Référence porte la description, les fiches de référence et les fiches de préparation', async () => {
    const { el } = await createFixture(
      makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', description: 'Un récit à découvrir' }),
      MJ_ID,
    );

    const reference = el.querySelector(ZONE_REFERENCE)!;
    expect(reference.textContent).toContain('Un récit à découvrir');
    expect(reference.querySelector('.reference-sheets')).toBeTruthy();
    expect(reference.querySelector('.prep-sheets')).toBeTruthy();
  });

  it('Joueur (non-MJ) : la zone Action est réduite au widget séance, aucun bloc MJ-only dans Consultation/Référence', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { el } = await createFixture(partie, PLAYER_ID);

    const action = el.querySelector(ZONE_ACTION)!;
    expect(action.querySelector('.scheduling-widget')).toBeTruthy();
    expect(action.querySelector('.xp-section')).toBeNull();
    expect(action.querySelector('.announcement-section')).toBeNull();

    // Revue de code (Story 32.2) : sans annonce de campagne ni bandeau transitoire, un joueur non-MJ
    // n'a aucun contenu de zone Consultation (isMj() faux ⇒ pas d'historique d'XP non plus) — la
    // zone entière est absente (hasConsultationContent()), pas seulement vide de bloc MJ-only.
    expect(el.querySelector(ZONE_CONSULTATION)).toBeNull();

    const reference = el.querySelector(ZONE_REFERENCE)!;
    // Les fiches de référence Ryuutama restent visibles au joueur (pas MJ-only) ; seules les fiches
    // de préparation sont MJ-only.
    expect(reference.querySelector('.reference-sheets')).toBeTruthy();
    expect(reference.querySelector('.prep-sheets')).toBeNull();
  });

  it('Système non-Ryuutama : les fiches de référence/préparation sont absentes de la zone Référence, les zones Action/Consultation restent intactes', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'draconis' });
    const { el } = await createFixture(partie, MJ_ID);

    const reference = el.querySelector(ZONE_REFERENCE)!;
    expect(reference.querySelector('.reference-sheets')).toBeNull();
    expect(reference.querySelector('.prep-sheets')).toBeNull();

    const action = el.querySelector(ZONE_ACTION)!;
    expect(action.querySelector('.scheduling-widget')).toBeTruthy();
    expect(action.querySelector('.xp-section')).toBeTruthy();
    expect(action.querySelector('.announcement-section')).toBeTruthy();
  });

  it('Vote de date en cours : le lien de vote reste dans le widget séance de la zone Action, inchangé', async () => {
    const partie = makePartie({ mjId: MJ_ID });
    const poll: SessionPollDto = {
      id: 'poll1',
      partieId: 'party-1',
      status: 'OPEN',
      scenarioRef: null,
      expiresAt: null,
      chosenDate: null,
      chosenSlot: null,
      membersCount: 2,
      options: [
        {
          id: 'opt1',
          date: '2026-08-01T00:00:00.000Z',
          slot: 'MORNING',
          votes: [],
        },
      ],
    };
    const { el } = await createFixture(partie, PLAYER_ID, { poll });

    const link = el.querySelector(`${ZONE_ACTION} .scheduling-widget a[mat-stroked-button]`);
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain('Vote de date en cours');
  });
});

// ─── Retouche UX de PartieDetail (scroll, aération, fiches de téléchargement, 2026-09-23) ────────

describe('PartieDetail — défilement de page unique (dynamicHeight)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("mat-tab-group porte dynamicHeight (API publique Material) -- l'overflow interne par défaut du corps d'onglet est neutralisé, la molette défile toute la page", async () => {
    const { fixture } = await createFixture(makePartie({ mjId: MJ_ID }), MJ_ID);

    const tabGroup = fixture.debugElement.query(By.directive(MatTabGroup))
      ?.componentInstance as MatTabGroup | undefined;
    expect(tabGroup).toBeTruthy();
    expect(tabGroup!.dynamicHeight).toBe(true);
  });
});

describe('PartieDetail — grimoires de référence/préparation repliés par défaut (retouche UX 2026-09-23)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('à l’affichage initial de l’onglet Détails, les deux grimoires (référence, préparation MJ) sont repliés', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { el } = await createFixture(partie, MJ_ID);

    const referenceDetails = el.querySelector<HTMLDetailsElement>('.reference-sheets details.download-sheet');
    const prepDetails = el.querySelector<HTMLDetailsElement>('.prep-sheets details.download-sheet');
    expect(referenceDetails).toBeTruthy();
    expect(prepDetails).toBeTruthy();
    expect(referenceDetails!.open).toBe(false);
    expect(prepDetails!.open).toBe(false);
  });

  it('un joueur (non-MJ) voit aussi le grimoire de référence replié par défaut (les fiches de préparation restent MJ-only, inchangé)', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { el } = await createFixture(partie, PLAYER_ID);

    const referenceDetails = el.querySelector<HTMLDetailsElement>('.reference-sheets details.download-sheet');
    expect(referenceDetails).toBeTruthy();
    expect(referenceDetails!.open).toBe(false);
    expect(el.querySelector('.prep-sheets')).toBeNull();
  });

  it('clic sur le résumé « Grimoires de référence » déplie la fiche -- les puces (icône+libellé) deviennent visibles', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, MJ_ID);

    const details = el.querySelector<HTMLDetailsElement>('.reference-sheets details.download-sheet')!;
    const summary = details.querySelector<HTMLElement>('summary')!;
    expect(details.open).toBe(false);

    summary.click();
    fixture.detectChanges();

    expect(details.open).toBe(true);
    const chips = details.querySelectorAll('.reference-sheets__links .dl-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toContain(
      TONE_MAP['grimoire-emeraude']['partie.asset_journal_cta'],
    );
  });

  it('clic sur le résumé « Grimoires de préparation (MJ) » déplie la fiche -- les 8 puces deviennent visibles', async () => {
    const partie = makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama' });
    const { fixture, el } = await createFixture(partie, MJ_ID);

    const details = el.querySelector<HTMLDetailsElement>('.prep-sheets details.download-sheet')!;
    const summary = details.querySelector<HTMLElement>('summary')!;
    expect(details.open).toBe(false);

    summary.click();
    fixture.detectChanges();

    expect(details.open).toBe(true);
    expect(details.querySelectorAll('.prep-sheets__links .dl-chip').length).toBe(8);
  });
});

describe('PartieDetail — barre d’icônes partagée (retouche UX 2026-09-23)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('MJ : les déclencheurs "Distribuer de l’XP" et "Proclamer une annonce" partagent la même barre d’icônes', async () => {
    const { el } = await createFixture(makePartie({ mjId: MJ_ID }), MJ_ID);

    const bar = el.querySelector('.details-zone--action .icon-bar');
    expect(bar).toBeTruthy();
    expect(bar!.querySelector('.xp-section button')).toBeTruthy();
    expect(bar!.querySelector('.announcement-section button')).toBeTruthy();
  });

  it('le pied de carte (Retranscrire/Sceller/Clore/Supprimer) est une barre d’icônes -- "Supprimer" porte la classe de couleur destructrice', async () => {
    const { el } = await createFixture(makePartie({ mjId: MJ_ID, status: 'EN_COURS' }), MJ_ID);

    const actions = el.querySelector('mat-card-actions.icon-bar');
    expect(actions).toBeTruthy();

    // Vérification visuelle réelle (bmad-build, 2026-09-23) : `color="warn"` sur `mat-button` n'a
    // aucun effet en theming M3 (documenté par Angular Material — « supported in M2 themes only »).
    // La classe `icon-bar__btn--danger` référence directement `--mat-sys-error` (patron déjà en
    // place ailleurs dans ce composant, `.notice.error`) ; c'est elle que ce test vérifie, pas
    // l'attribut `color` désormais retiré du bouton.
    const deleteButton = Array.from(el.querySelectorAll('mat-card-actions.icon-bar button')).find((b) =>
      b.textContent?.includes(TONE_MAP['grimoire-emeraude']['partie.delete_btn']),
    );
    expect(deleteButton).toBeTruthy();
    expect(deleteButton!.classList.contains('icon-bar__btn--danger')).toBe(true);
  });
});

describe('PartieDetail — patron de carte à liseré, revue de code (retouche UX 2026-09-23)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('MJ, système Ryuutama : app-xp-history et chaque app-annonce-card reçoivent les classes de carte de la zone Consultation', async () => {
    const announcements = [makeAnnouncementDto({ id: 'ann-1', scenarioId: null })];
    const { el } = await createFixture(
      makePartie({ mjId: MJ_ID, gameSystemId: 'ryuutama', kind: 'CAMPAGNE_LINEAIRE' }),
      MJ_ID,
      { announcements },
    );

    const xpHistory = el.querySelector('app-xp-history');
    expect(xpHistory).toBeTruthy();
    expect(xpHistory!.classList.contains('zone-card')).toBe(true);
    expect(xpHistory!.classList.contains('zone-card--consultation')).toBe(true);

    const annonceCard = el.querySelector('app-annonce-card');
    expect(annonceCard).toBeTruthy();
    expect(annonceCard!.classList.contains('zone-card')).toBe(true);
    expect(annonceCard!.classList.contains('zone-card--consultation')).toBe(true);
    expect(annonceCard!.classList.contains('zone-card--flush')).toBe(true);
  });

  it('la description de la partie (zone Référence) reçoit le même patron de carte à liseré que les deux autres zones', async () => {
    const { el } = await createFixture(
      makePartie({ mjId: MJ_ID, description: 'Un récit à découvrir' }),
      MJ_ID,
    );

    const reference = el.querySelector('.details-zone--reference .zone-card--reference');
    expect(reference).toBeTruthy();
    expect(reference!.textContent).toContain('Un récit à découvrir');
  });
});
