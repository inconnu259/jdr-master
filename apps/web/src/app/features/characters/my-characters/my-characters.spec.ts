import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { AuthUser, MyCharacterDto, PartieDto, PartySignalsDto } from '@master-jdr/shared';
import { MyCharacters } from './my-characters';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountService } from '../../../core/account/account.service';
import { PartySignalsService } from '../../../core/parties/party-signals.service';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';

function makeMyCharacter(overrides: Partial<MyCharacterDto> = {}): MyCharacterDto {
  return {
    ...makeCharacterDto({ sheetData: { narrative: { name: overrides.id ?? 'Fenn' } } }),
    partieId: 'p1',
    partieName: 'La Forêt Noire',
    classLabel: null,
    typeLabel: null,
    groupRoleLabel: null,
    ...overrides,
  };
}

function makePartie(overrides: Partial<PartieDto> = {}): PartieDto {
  return {
    id: 'p1',
    name: 'La Forêt Noire',
    kind: 'ONE_SHOT',
    gameSystemId: 'ryuutama',
    description: null,
    mjId: 'mj1',
    createdAt: '2026-01-01T00:00:00.000Z',
    nextSessionDate: null,
    nextSessionSlot: null,
    role: 'player',
    status: 'EN_COURS',
    isFavorite: false,
    coverImageVersion: null,
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
  return { updatePreferences: vi.fn().mockResolvedValue(undefined) };
}

function makePartySignalsService(signalsMap: Map<string, PartySignalsDto> = new Map()) {
  return {
    signals: signal(signalsMap),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMyPartiesService(parties: PartieDto[] = []) {
  return { allParties: signal(parties) };
}

async function createFixture(
  list: MyCharacterDto[] = [],
  authUserOverrides: Partial<AuthUser> = {},
  accountSvc = makeAccountService(),
  options: { partySignalsSvc?: ReturnType<typeof makePartySignalsService>; parties?: PartieDto[] } = {},
) {
  const characterService = {
    listMine: vi.fn().mockResolvedValue(list),
  };
  const authSvc = { currentUser: signal(makeAuthUser(authUserOverrides)) };
  const partySignalsSvc = options.partySignalsSvc ?? makePartySignalsService();
  const myPartiesSvc = makeMyPartiesService(options.parties ?? []);
  await TestBed.configureTestingModule({
    imports: [MyCharacters],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: CharacterService, useValue: characterService },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
      { provide: AuthService, useValue: authSvc },
      { provide: AccountService, useValue: accountSvc },
      { provide: PartySignalsService, useValue: partySignalsSvc },
      { provide: MyPartiesService, useValue: myPartiesSvc },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MyCharacters);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  return { fixture, characterService, authSvc, accountSvc, partySignalsSvc, myPartiesSvc };
}

describe('MyCharacters (Story 29.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('charge la liste au montage via listMine() (AC1)', async () => {
    const { characterService } = await createFixture([makeMyCharacter({ id: 'c1' })]);
    expect(characterService.listMine).toHaveBeenCalledTimes(1);
  });

  it('affiche tous les personnages, toutes parties confondues (AC1)', async () => {
    const { fixture } = await createFixture([
      makeMyCharacter({ id: 'c1', partieId: 'p1', partieName: 'La Forêt Noire' }),
      makeMyCharacter({ id: 'c2', partieId: 'p2', partieName: 'Le Donjon Oublié' }),
    ]);

    const cards = fixture.nativeElement.querySelectorAll('.character-summary-card');
    expect(cards.length).toBe(2);
  });

  it('liste vide → message vide, aucune carte (AC2 : jamais de mélange avec un autre type de liste)', async () => {
    const { fixture } = await createFixture([]);

    expect(fixture.nativeElement.querySelector('.character-summary-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.empty')).not.toBeNull();
  });

  it('le nom du personnage (convention épic 28) et le nom de la Partie sont affichés (AC3)', async () => {
    const { fixture } = await createFixture([
      makeMyCharacter({
        id: 'c1',
        sheetData: { narrative: { name: 'Ombreflèche' } },
        partieName: 'La Forêt Noire',
      }),
    ]);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Ombreflèche');
    expect(text).toContain('La Forêt Noire');
  });

  it('la recherche filtre la liste en direct, sans mélanger avec les personnages non correspondants (AC4)', async () => {
    const { fixture } = await createFixture([
      makeMyCharacter({ id: 'c1', sheetData: { narrative: { name: 'Ombreflèche' } } }),
      makeMyCharacter({ id: 'c2', sheetData: { narrative: { name: 'Fenn' } } }),
    ]);

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '.list-control-bar__search input',
    );
    input.value = 'ombre';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Ombreflèche');
    expect(text).not.toContain('Fenn');
  });

  it('recherche sans résultat → message dédié, distinct du message « aucun personnage »', async () => {
    const { fixture } = await createFixture([
      makeMyCharacter({ id: 'c1', sheetData: { narrative: { name: 'Ombreflèche' } } }),
    ]);

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '.list-control-bar__search input',
    );
    input.value = 'zzz-introuvable';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.character-summary-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.empty')).not.toBeNull();
  });

  it('clic sur une carte navigue vers /parties/:partieId/characters/:id', async () => {
    const { fixture } = await createFixture([makeMyCharacter({ id: 'c1', partieId: 'p1' })]);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.character-summary-card') as HTMLButtonElement).click();

    expect(navigateSpy).toHaveBeenCalledWith(['/parties', 'p1', 'characters', 'c1']);
  });
});

describe('MyCharacters — tri, mode d’affichage (Story 29.9)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("changer le tri appelle AccountService.updatePreferences({ charactersSort }) et réordonne l'affichage", async () => {
    const { fixture, accountSvc } = await createFixture(
      [
        makeMyCharacter({ id: 'c1', sheetData: { narrative: { name: 'Zebre' } } }),
        makeMyCharacter({ id: 'c2', sheetData: { narrative: { name: 'Abbaye' } } }),
      ],
      { charactersSort: 'partie' },
    );

    const select: HTMLSelectElement = fixture.nativeElement.querySelector(
      '.list-control-bar__fields select',
    );
    select.value = 'nom';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(accountSvc.updatePreferences).toHaveBeenCalledWith({ charactersSort: 'nom' });
    const names = Array.from(
      fixture.nativeElement.querySelectorAll('.character-summary-card__name'),
    ).map((el: any) => el.textContent?.trim());
    expect(names).toEqual(['Abbaye Niv. 1', 'Zebre Niv. 1']);
  });

  it("bascule de mode d'affichage appelle AccountService.updatePreferences({ charactersViewMode }) et change la classe CSS de la liste", async () => {
    const { fixture, accountSvc } = await createFixture([makeMyCharacter({ id: 'c1' })]);

    const modeButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.list-control-bar__mode');
    modeButtons[0].click(); // 'large'
    fixture.detectChanges();
    await fixture.whenStable();

    expect(accountSvc.updatePreferences).toHaveBeenCalledWith({ charactersViewMode: 'large' });
    expect(fixture.nativeElement.querySelector('.list--large')).not.toBeNull();
  });

  it('aucune pastille de résumé jamais affichée (AC6 — aucun réglage transitoire sur cet écran)', async () => {
    const { fixture } = await createFixture([makeMyCharacter({ id: 'c1' })]);

    expect(fixture.nativeElement.querySelector('.list-control-bar__reset')).toBeNull();
  });
});

// Aucune spec ne différenciait grand de moyen pour les personnages (EXPERIENCE.md:107 impose
// seulement de transposer la grammaire de la liste des parties) : le mode grand est celui qui
// porte les stats dérivées, décision prise avec l'utilisateur.
describe('MyCharacters — ce qui distingue les 3 modes (Story 29.9, AC1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mode grand → les stats dérivées sont affichées', async () => {
    const { fixture } = await createFixture([makeMyCharacter({ id: 'c1' })], {
      charactersViewMode: 'large',
    });

    expect(fixture.nativeElement.querySelector('.stat-pill')).not.toBeNull();
  });

  it('modes moyen et liste → aucune stat dérivée', async () => {
    for (const mode of ['medium', 'compact'] as const) {
      const { fixture } = await createFixture([makeMyCharacter({ id: 'c1' })], {
        charactersViewMode: mode,
      });
      expect(fixture.nativeElement.querySelector('.stat-pill')).toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('mode liste → classe et partie conservées en une sous-ligne (retour utilisateur)', async () => {
    const { fixture } = await createFixture(
      [makeMyCharacter({ id: 'c1', classLabel: 'Marchand', partieName: 'La Forêt Noire' })],
      { charactersViewMode: 'compact' },
    );

    const sub = fixture.nativeElement.querySelector('.character-summary-card__compact-sub');
    expect(sub.textContent.trim()).toBe('Marchand · La Forêt Noire');
  });
});

describe('MyCharacters — bandeau contextuel (Story 29.4)', () => {
  it("ngOnInit() renseigne ContextualNavService avec le titre de l'écran", async () => {
    await createFixture([]);

    const contextualNav = TestBed.inject(ContextualNavService);
    expect(contextualNav.title()).toBe(TONE_MAP['grimoire-emeraude']['my_characters.title']);
  });
});

describe('MyCharacters — section de création « À forger » (Story 29.16)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ngOnInit() appelle partySignalsService.refresh() (rafraîchit les signaux à l’activation de la route)', async () => {
    const { partySignalsSvc } = await createFixture([]);

    expect(partySignalsSvc.refresh).toHaveBeenCalledTimes(1);
  });

  it('aucun signal PERSONNAGE_A_CREER → section absente (ni titre ni cadre)', async () => {
    const { fixture } = await createFixture(
      [],
      {},
      makeAccountService(),
      { parties: [makePartie({ id: 'p1' })] },
    );

    expect(fixture.nativeElement.querySelector('.character-creation-entries')).toBeNull();
  });

  it('un signal PERSONNAGE_A_CREER pour une partie → une ligne, croisée avec allParties() pour nom et gameSystemId', async () => {
    const signalsMap = new Map<string, PartySignalsDto>([
      ['p1', { role: 'player', status: 'EN_COURS', signals: ['PERSONNAGE_A_CREER'] }],
    ]);
    const { fixture } = await createFixture(
      [],
      {},
      makeAccountService(),
      {
        partySignalsSvc: makePartySignalsService(signalsMap),
        parties: [makePartie({ id: 'p1', name: 'Le Convoi du Nord', gameSystemId: 'ryuutama' })],
      },
    );

    const row: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '.character-creation-entries__row',
    );
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Créer un voyageur pour Le Convoi du Nord');
    expect(row.getAttribute('href')).toContain('/parties/p1/characters/new');
    expect(row.getAttribute('href')).toContain('gameSystemId=ryuutama');
  });

  it('une partie sans signal PERSONNAGE_A_CREER (MJ, système sans module, terminée…) ne produit aucune ligne', async () => {
    const signalsMap = new Map<string, PartySignalsDto>([
      ['p1', { role: 'mj', status: 'EN_COURS', signals: ['AUCUN_MEMBRE_INVITE'] }],
    ]);
    const { fixture } = await createFixture(
      [],
      {},
      makeAccountService(),
      {
        partySignalsSvc: makePartySignalsService(signalsMap),
        parties: [makePartie({ id: 'p1' })],
      },
    );

    expect(fixture.nativeElement.querySelector('.character-creation-entries')).toBeNull();
  });

  it('section rendue + liste de personnages vide → message my_characters.empty_with_entries (pas my_characters.empty)', async () => {
    const signalsMap = new Map<string, PartySignalsDto>([
      ['p1', { role: 'player', status: 'EN_COURS', signals: ['PERSONNAGE_A_CREER'] }],
    ]);
    const { fixture } = await createFixture(
      [],
      {},
      makeAccountService(),
      {
        partySignalsSvc: makePartySignalsService(signalsMap),
        parties: [makePartie({ id: 'p1' })],
      },
    );

    const empty = fixture.nativeElement.querySelector('.empty');
    expect(empty.textContent.trim()).toBe(
      TONE_MAP['grimoire-emeraude']['my_characters.empty_with_entries'],
    );
  });

  it('liste de personnages vide sans aucune ligne éligible → message my_characters.empty d’origine', async () => {
    const { fixture } = await createFixture([]);

    const empty = fixture.nativeElement.querySelector('.empty');
    expect(empty.textContent.trim()).toBe(TONE_MAP['grimoire-emeraude']['my_characters.empty']);
  });

  it('refresh() encore en vol : reste sur my_characters.empty (pas de clignotement) même si listMine() a déjà résolu et qu’une ligne serait éligible', async () => {
    let resolveRefresh!: () => void;
    const pendingRefresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const signalsMap = new Map<string, PartySignalsDto>([
      ['p1', { role: 'player', status: 'EN_COURS', signals: ['PERSONNAGE_A_CREER'] }],
    ]);
    const partySignalsSvc = {
      signals: signal(signalsMap),
      refresh: vi.fn().mockReturnValue(pendingRefresh),
    };
    const { fixture } = await createFixture([], {}, makeAccountService(), {
      partySignalsSvc,
      parties: [makePartie({ id: 'p1' })],
    });

    // listMine() (résolu par createFixture) est déjà arrivé, mais refresh() est toujours en vol.
    expect(fixture.nativeElement.querySelector('.empty').textContent.trim()).toBe(
      TONE_MAP['grimoire-emeraude']['my_characters.empty'],
    );

    resolveRefresh();
    // Même patron que createFixture() ci-dessus : plusieurs tours de microtâches plutôt qu'un
    // nombre codé en dur, insensible à la profondeur exacte de la chaîne `.finally()`.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(fixture.nativeElement.querySelector('.empty').textContent.trim()).toBe(
      TONE_MAP['grimoire-emeraude']['my_characters.empty_with_entries'],
    );
  });
});
