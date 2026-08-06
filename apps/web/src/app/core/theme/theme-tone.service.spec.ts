import { TestBed } from '@angular/core/testing';
import { ThemeToneService } from './theme-tone.service';

describe('ThemeToneService', () => {
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it("AC3 (Story 28.4) : le thème connu localement s'applique dès la construction, indépendamment de toute authentification", () => {
    // Simule l'état « pas encore connecté » : localStorage porte le dernier thème connu, aucune
    // session/AuthService n'entre en jeu — reproduit fidèlement app.ts (ThemeToneService injecté
    // hors de toute dépendance à l'auth, cf. Dev Notes de la story).
    localStorage.setItem('jdr-theme', 'foret-ancienne');

    const service = TestBed.inject(ThemeToneService);

    expect(service.activeTheme()).toBe('foret-ancienne');
    expect(document.body.classList.contains('theme-foret-ancienne')).toBe(true);
  });

  it('valeur localStorage invalide/inexistante → repli sur le thème par défaut, sans plantage', () => {
    localStorage.setItem('jdr-theme', 'theme-disparu');

    const service = TestBed.inject(ThemeToneService);

    expect(service.activeTheme()).toBe('grimoire-emeraude');
  });

  it('aucune valeur en localStorage → thème par défaut', () => {
    const service = TestBed.inject(ThemeToneService);

    expect(service.activeTheme()).toBe('grimoire-emeraude');
  });
});
