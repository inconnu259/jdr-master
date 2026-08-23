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
    // Story 36.12 — l'Agenda du MJ.
    'calendar.agenda.badge_to_seal',
    'calendar.agenda.poll_open',
    'calendar.agenda.responded_count',
    'calendar.agenda.slots_proposed',
    'calendar.agenda.missing_voters',
    'calendar.agenda.no_date',
    'calendar.agenda.no_date_proposed',
    'calendar.agenda.action_launch_poll',
    'calendar.agenda.action_seal',
    'calendar.agenda.action_expand',
    'calendar.agenda.action_collapse',
    'calendar.agenda.seal_confirm_title',
    'calendar.agenda.seal_confirm_body',
  ];

  for (const theme of THEMES) {
    it(`${theme} porte les ${AGENDA_KEYS.length} clés, toutes non vides`, () => {
      for (const key of AGENDA_KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }

  // Story 36.12 — 🚨 le libellé de scellement est RÉPÉTÉ sur chaque option d'un vote déplié, et un
  // vote en porte jusqu'à quarante. Trouvé à l'écran : avec la phrase de `cta.choose_date`
  // (« Planter le drapeau de la clairière »), chaque option passait sur deux lignes et la liste
  // devenait un mur. Une future relecture éditoriale (35.3) ne doit pas pouvoir le rallonger.
  for (const theme of THEMES) {
    it(`${theme} garde un libellé de scellement COURT`, () => {
      expect(TONE_MAP[theme]['calendar.agenda.action_seal'].length).toBeLessThanOrEqual(14);
    });
  }

  // Revue de code (36.12) — même famille de bouton contraint en largeur que `action_seal`
  // (`.agenda-entry__launch`, `white-space: nowrap`), mais rendu une seule fois par ligne « sans
  // date » plutôt que répété par option : seuil plus large, aligné sur le maximum actuel (18).
  for (const theme of THEMES) {
    it(`${theme} garde un libellé de « Lancer un vote » raisonnablement COURT`, () => {
      expect(TONE_MAP[theme]['calendar.agenda.action_launch_poll'].length).toBeLessThanOrEqual(20);
    });
  }

  // Story 36.12 — une clé à trou dont le thème a « oublié » le trou rend le gabarit littéral à
  // l'écran (« {n} sur {total} ont répondu »). Le typage ne peut rien voir : ce sont des chaînes.
  const PLACEHOLDERS: Record<string, string[]> = {
    'calendar.agenda.responded_count': ['{n}', '{total}'],
    'calendar.agenda.slots_proposed': ['{n}'],
    'calendar.agenda.missing_voters': ['{names}'],
  };

  for (const theme of THEMES) {
    it(`${theme} garde les gabarits à trou de l’Agenda`, () => {
      for (const [key, tokens] of Object.entries(PLACEHOLDERS)) {
        for (const token of tokens) {
          expect(TONE_MAP[theme][key], `${theme} / ${key}`).toContain(token);
        }
      }
    });
  }
});
