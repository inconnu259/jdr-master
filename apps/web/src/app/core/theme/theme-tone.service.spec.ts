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

// Story 36.14 — la barre repliée, le panneau « Affichage », la légende et les intentions de
// compte. Même garde que ci-dessus : aucun test de composant ne tourne hors du thème par défaut,
// donc une clé oubliée dans deux thèmes sur trois ne se verrait qu'à l'écran.
describe('TONE_MAP — les clés de la story 36.14 existent dans les TROIS thèmes', () => {
  const DISPLAY_KEYS = [
    'calendar.display.trigger',
    'calendar.display.trigger_aria',
    'calendar.display.section_visible',
    'calendar.display.show_legend',
    'calendar.display.filtered_badge',
    'calendar.legend.title',
    'calendar.legend.group_obvious',
    'calendar.legend.group_needs',
    'calendar.legend.entry.available',
    'calendar.legend.entry.unavailable',
    'calendar.legend.entry.seance',
    'calendar.legend.entry.vote',
    'calendar.legend.entry.poll_track',
    'calendar.legend.entry.group',
    'calendar.legend.entry.none',
    'account.calendar_intents_subtitle',
    'account.calendar_intent.disponibilites',
    'account.calendar_intent.seances',
    'account.calendar_intent.votes',
    'account.calendar_intent.groupe',
  ];

  for (const theme of THEMES) {
    it(`${theme} porte les ${DISPLAY_KEYS.length} clés, toutes non vides`, () => {
      for (const key of DISPLAY_KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }

  // 🚨 Le déclencheur PARTAGE UNE LIGNE avec la bascule de vues, la pastille de résumé et jusqu'à
  // deux chips de mode — et c'est cette ligne unique qui est toute la raison d'être de la story
  // (`deferred-work.md:66` : la barre passait à DEUX lignes dès 1400 px). Un libellé long le
  // reproduirait exactement. Même patron de garde que `calendar.agenda.action_seal`, dont la
  // story 36.12 a découvert le défaut à l'écran et pas aux tests.
  for (const theme of THEMES) {
    it(`${theme} garde un libellé d'« Affichage » COURT`, () => {
      expect(TONE_MAP[theme]['calendar.display.trigger'].length).toBeLessThanOrEqual(12);
    });
  }

  // La pastille est `white-space: nowrap` et porte déjà deux nombres : son gabarit doit rester
  // court, sinon elle pousse la bascule de vues hors de la ligne.
  for (const theme of THEMES) {
    it(`${theme} garde un gabarit de pastille COURT`, () => {
      expect(TONE_MAP[theme]['calendar.display.filtered_badge'].length).toBeLessThanOrEqual(48);
    });
  }

  // Un thème qui « oublierait » un trou rendrait le gabarit littéral (« {n} sur {total} »).
  for (const theme of THEMES) {
    it(`${theme} conserve les deux trous de la pastille de résumé`, () => {
      const value = TONE_MAP[theme]['calendar.display.filtered_badge'];
      expect(value, `${theme} / {n}`).toContain('{n}');
      expect(value, `${theme} / {total}`).toContain('{total}');
    });
  }
});
