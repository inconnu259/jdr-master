import { TestBed } from '@angular/core/testing';
import { ThemeToneService } from './theme-tone.service';
import { THEMES, TONE_MAP } from './tones';

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

// Story 36.11 — garde contre le piège n°12 de la 36.9 : une clé posée dans un seul thème rend
// `undefined` à l'écran dans les deux autres, et aucun test de composant ne le voit (ils tournent
// tous sur le thème par défaut).
describe('TONE_MAP — les clés de la vue Agenda existent dans les TROIS thèmes', () => {
  const AGENDA_KEYS = [
    'calendar.agenda.section_awaiting',
    'calendar.agenda.section_scheduled',
    'calendar.agenda.section_past',
    'calendar.agenda.badge_answer_poll',
    'calendar.agenda.badge_poll_open',
    'calendar.agenda.badge_signup',
    'calendar.agenda.badge_signed_up',
    'calendar.agenda.badge_debrief',
    'calendar.agenda.empty',
  ];

  for (const theme of THEMES) {
    it(`${theme} porte les ${AGENDA_KEYS.length} clés, toutes non vides`, () => {
      for (const key of AGENDA_KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }
});
