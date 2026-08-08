import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { MyCharacterDto } from '@master-jdr/shared';
import { MyCharacters } from './my-characters';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';

function makeMyCharacter(overrides: Partial<MyCharacterDto> = {}): MyCharacterDto {
  return {
    ...makeCharacterDto({ sheetData: { narrative: { name: overrides.id ?? 'Fenn' } } }),
    partieId: 'p1',
    partieName: 'La Forêt Noire',
    ...overrides,
  };
}

async function createFixture(list: MyCharacterDto[] = []) {
  const characterService = {
    listMine: vi.fn().mockResolvedValue(list),
  };
  await TestBed.configureTestingModule({
    imports: [MyCharacters],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: CharacterService, useValue: characterService },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MyCharacters);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  return { fixture, characterService };
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
      makeMyCharacter({ id: 'c1', sheetData: { narrative: { name: 'Ombreflèche' } }, partieName: 'La Forêt Noire' }),
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

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[matInput]');
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

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[matInput]');
    input.value = 'zzz-introuvable';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.character-summary-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.empty')).not.toBeNull();
  });

  it('clic sur une carte navigue vers /parties/:partieId/characters/:id', async () => {
    const { fixture } = await createFixture([
      makeMyCharacter({ id: 'c1', partieId: 'p1' }),
    ]);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.character-summary-card') as HTMLButtonElement).click();

    expect(navigateSpy).toHaveBeenCalledWith(['/parties', 'p1', 'characters', 'c1']);
  });
});
