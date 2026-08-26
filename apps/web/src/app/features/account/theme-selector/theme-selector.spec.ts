import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { ThemeSelector } from './theme-selector';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { AccountService } from '../../../core/account/account.service';

function makeThemeSvc(active = 'grimoire-emeraude') {
  return {
    activeTheme: signal(active),
    themes: ['grimoire-emeraude', 'foret-ancienne', 'medieval-steampunk'],
    themeNames: {
      'grimoire-emeraude': 'Grimoire Émeraude',
      'foret-ancienne': 'Forêt Ancienne',
      'medieval-steampunk': 'Médiéval Steampunk',
    },
    setTheme: vi.fn(),
  };
}

async function createFixture(themeSvc = makeThemeSvc(), accountSvc = { setTheme: vi.fn() }) {
  await TestBed.configureTestingModule({
    imports: [ThemeSelector],
    providers: [
      { provide: ThemeToneService, useValue: themeSvc },
      { provide: AccountService, useValue: accountSvc },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ThemeSelector);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ThemeSelector', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("l'icône check s'affiche sur le thème actif", async () => {
    const { el } = await createFixture(makeThemeSvc('foret-ancienne'));
    const options = el.querySelectorAll('.theme-option');
    const active = Array.from(options).find((o) => o.classList.contains('active'));
    expect(active?.querySelector('.name')?.textContent?.trim()).toBe('Forêt Ancienne');
    expect(active?.querySelector('.check')).not.toBeNull();
  });

  it('sélectionner un thème appelle themeSvc.setTheme() ET accountSvc.setTheme() avec la même valeur', async () => {
    const themeSvc = makeThemeSvc('grimoire-emeraude');
    const accountSvc = { setTheme: vi.fn().mockResolvedValue({}) };
    const { el } = await createFixture(themeSvc, accountSvc);

    const options = Array.from(el.querySelectorAll<HTMLButtonElement>('.theme-option'));
    const foretOption = options.find(
      (o) => o.querySelector('.name')?.textContent?.trim() === 'Forêt Ancienne',
    );
    foretOption!.click();

    expect(themeSvc.setTheme).toHaveBeenCalledWith('foret-ancienne');
    expect(accountSvc.setTheme).toHaveBeenCalledWith('foret-ancienne');
  });
});
