import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { AuthUser, MyCharacterDto } from '@master-jdr/shared';
import { MyCharacters } from './my-characters';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountService } from '../../../core/account/account.service';

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

async function createFixture(
  list: MyCharacterDto[] = [],
  authUserOverrides: Partial<AuthUser> = {},
  accountSvc = makeAccountService(),
) {
  const characterService = {
    listMine: vi.fn().mockResolvedValue(list),
  };
  const authSvc = { currentUser: signal(makeAuthUser(authUserOverrides)) };
  await TestBed.configureTestingModule({
    imports: [MyCharacters],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: CharacterService, useValue: characterService },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
      { provide: AuthService, useValue: authSvc },
      { provide: AccountService, useValue: accountSvc },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MyCharacters);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  return { fixture, characterService, authSvc, accountSvc };
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
