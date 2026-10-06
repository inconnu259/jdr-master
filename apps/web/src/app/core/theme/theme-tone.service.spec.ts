import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ThemeToneService } from './theme-tone.service';
import { THEME_NAMES, THEMES, TONE_MAP, type Theme } from './tones';

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

  it("Story 35.1 : un cache d'avant le renommage (`medieval-steampunk`) est lu comme `atelier-cuivre`", () => {
    localStorage.setItem('jdr-theme', 'medieval-steampunk');

    const service = TestBed.inject(ThemeToneService);

    expect(service.activeTheme()).toBe('atelier-cuivre');
    expect(document.body.classList.contains('theme-atelier-cuivre')).toBe(true);
    expect(document.body.classList.contains('theme-medieval-steampunk')).toBe(false);
  });

  it("Story 35.1 : une clé héritée du prototype (`constructor`) n'est pas prise pour un alias", () => {
    localStorage.setItem('jdr-theme', 'constructor');

    const service = TestBed.inject(ThemeToneService);

    expect(service.activeTheme()).toBe('grimoire-emeraude');
  });
});

// Story 35.1 — registre découpé en un fichier par thème.
describe('Tones — registre découpé par thème (Story 35.1)', () => {
  it('Atelier Cuivré est le nom affiché du thème `atelier-cuivre`', () => {
    expect(THEME_NAMES['atelier-cuivre']).toBe('Atelier Cuivré');
    expect(THEMES).toContain('atelier-cuivre');
    expect(THEMES).not.toContain('medieval-steampunk' as never);
  });

  it('les trois thèmes portent exactement le même jeu de clés, valeurs non vides', () => {
    const reference = Object.keys(TONE_MAP['grimoire-emeraude']).sort();
    expect(reference.length).toBeGreaterThan(0);
    for (const theme of THEMES) {
      expect(Object.keys(TONE_MAP[theme]).sort(), theme).toEqual(reference);
      for (const [key, value] of Object.entries(TONE_MAP[theme])) {
        expect(value.length, `${theme} → ${key}`).toBeGreaterThan(0);
      }
    }
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

// Story 31.1 — le menu « ⋮ » de la fiche. Même garde que ci-dessus : `character.pdf_crop_edit_cta`
// manquait déjà dans `foret-ancienne` avant cette story (invisible faute de ce test), corrigé au
// passage puisque cette story déplace précisément cette clé dans le nouveau menu.
describe('TONE_MAP — les clés du menu de la fiche (story 31.1) existent dans les TROIS thèmes', () => {
  const SHEET_MENU_KEYS = [
    'character.sheet_menu_trigger_aria',
    'character.export_editable_cta',
    'character.export_2pages_cta',
    'character.export_equipment_cta',
    'character.export_notes_cta',
    'character.pdf_crop_edit_cta',
  ];

  for (const theme of THEMES) {
    it(`${theme} porte les ${SHEET_MENU_KEYS.length} clés, toutes non vides`, () => {
      for (const key of SHEET_MENU_KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }
});

// Story 31.4 — micro-copie du wizard de création et de la surface de détail. `TONE_MAP` garantit
// la présence des trois thèmes, PAS celle d'une clé dans chacun : une clé oubliée compile et rend
// `undefined` à l'écran. Seul ce test de parité l'attrape.
describe('Tones — surface de détail et wizard de création (Story 31.4)', () => {
  const WIZARD_KEYS = [
    'detail.row_attributes',
    'detail.row_difficulty',
    'detail.row_effect',
    'detail.row_conditions',
    'detail.narrative_show',
    'detail.narrative_hide',
    'character.equipment_group_individual',
    'character.equipment_group_contenant',
    'character.equipment_group_animal',
    'character.equipment_search_label',
    'character.equipment_search_placeholder',
    'character.equipment_search_empty',
    'character.equipment_budget',
    'character.equipment_over_budget',
    'character.choice_deselect_hint',
    'character.choice_talents_label',
    'character.choice_advantages_label',
    'character.choice_required_flag',
    'character.choice_reference_toggle',
    'character.equipment_group_toggle',
    'character.equipment_filter_all',
    'character.equipment_filter_mine',
    'character.equipment_qty_less',
    'character.equipment_qty_more',
    'character.recap_button',
    'character.recap_title',
    'character.recap_cart_title',
    'character.recap_remove',
    'character.recap_total',
    'character.recap_empty_hint',
  ];
  const PLACEHOLDERS: Record<string, string[]> = {
    'character.equipment_budget': ['{spent}', '{total}'],
    'character.equipment_over_budget': ['{n}'],
    'character.equipment_group_toggle': ['{group}', '{n}'],
    'character.equipment_qty_less': ['{name}'],
    'character.equipment_qty_more': ['{name}'],
  };

  for (const theme of THEMES) {
    it(`${theme} porte les ${WIZARD_KEYS.length} clés, toutes non vides`, () => {
      for (const key of WIZARD_KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });

    it(`${theme} garde les gabarits à trou du wizard`, () => {
      for (const [key, tokens] of Object.entries(PLACEHOLDERS)) {
        for (const token of tokens) {
          expect(TONE_MAP[theme][key], `${theme} / ${key}`).toContain(token);
        }
      }
    });
  }
});

// Story 29.15 — l'onglet "Ma fiche" (état vide) et le slot d'initiale du roster (tooltip
// accessible) gagnent chacun une nouvelle clé thématisée. Même garde de parité que ci-dessus.
describe('Tones — bouton clair pour créer son personnage depuis la partie (Story 29.15)', () => {
  const KEYS = ['character.no_character_yet', 'roster.create_slot_label'];

  for (const theme of THEMES) {
    it(`${theme} porte les ${KEYS.length} clés, toutes non vides`, () => {
      for (const key of KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }
});

// Spec fiches-personnages-partie-et-retour — libellé de l'onglet « Fiches » (renommé depuis
// « Ma fiche ») et bouton retour de la fiche vers la partie. Même garde de parité que ci-dessus :
// une clé posée dans un seul thème rendrait `undefined` à l'écran dans les deux autres.
describe('Tones — onglet « Fiches » et bouton retour (spec fiches-personnages-partie-et-retour)', () => {
  const KEYS = ['character.party_sheets_tab_label', 'character.back_to_partie_cta'];

  for (const theme of THEMES) {
    it(`${theme} porte les ${KEYS.length} clés, toutes non vides`, () => {
      for (const key of KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }
});

// Story 29.16 — la section « À forger » de l'écran Personnages. Même garde de parité que
// ci-dessus : une clé posée dans un seul thème rendrait `undefined` à l'écran dans les deux
// autres, invisible à tout test de composant (ils tournent sur le thème par défaut).
describe('Tones — section de création depuis « Personnages » (Story 29.16)', () => {
  const KEYS = [
    'my_characters.create_title',
    'my_characters.create_entry',
    'my_characters.create_more',
    'my_characters.create_more_one',
    'my_characters.create_less',
    'my_characters.empty_with_entries',
  ];
  const PLACEHOLDERS: Record<string, string[]> = {
    'my_characters.create_entry': ['{partie}'],
    'my_characters.create_more': ['{n}'],
  };

  for (const theme of THEMES) {
    it(`${theme} porte les ${KEYS.length} clés, toutes non vides`, () => {
      for (const key of KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });

    it(`${theme} garde les gabarits à trou de la section de création`, () => {
      for (const [key, tokens] of Object.entries(PLACEHOLDERS)) {
        for (const token of tokens) {
          expect(TONE_MAP[theme][key], `${theme} / ${key}`).toContain(token);
        }
      }
    });
  }
});

// Story 33.5 — ligne de création de l'Homme Dragon et libellé du marqueur de nature. Même garde
// de parité que ci-dessus ; « Homme Dragon » est un nom propre du système, jamais thématisé :
// `character.nature_dragon` doit être strictement identique dans les trois thèmes.
describe('Tones — Homme Dragon dans « Personnages » (Story 33.5)', () => {
  for (const theme of THEMES) {
    it(`${theme} porte my_characters.create_entry_hd (gabarit {partie}) et character.nature_dragon`, () => {
      expect(
        TONE_MAP[theme]['my_characters.create_entry_hd'],
        `${theme} / create_entry_hd`,
      ).toBeTruthy();
      expect(TONE_MAP[theme]['my_characters.create_entry_hd']).toContain('{partie}');
      expect(TONE_MAP[theme]['my_characters.create_entry_hd']).toContain('Homme Dragon');
      expect(TONE_MAP[theme]['character.nature_dragon'], `${theme} / nature_dragon`).toBeTruthy();
    });
  }

  it('character.nature_dragon est identique dans les trois thèmes (nom propre, jamais thématisé)', () => {
    const values = THEMES.map((theme) => TONE_MAP[theme]['character.nature_dragon']);
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe('Homme Dragon');
  });
});

// Story 31.7 — bouton MJ-only "Confidentialité" vers l'écran de configuration des cadenas.
// Même garde de parité que ci-dessus.
describe('Tones — bouton "Confidentialité" de PartieDetail (Story 31.7)', () => {
  for (const theme of THEMES) {
    it(`${theme} porte la clé partie.visibility_btn, non vide`, () => {
      expect(TONE_MAP[theme]['partie.visibility_btn']).toBeTruthy();
    });
  }
});

// Correctif de revue (session bmad-build, 2026-09-22) : message affiché sur CharacterSheet quand
// `derived` est masqué par un cadenas de visibilité (Story 31.6) — même garde de parité que ci-dessus.
describe('Tones — statistiques dérivées masquées sur CharacterSheet (correctif Story 31.6/31.7)', () => {
  for (const theme of THEMES) {
    it(`${theme} porte la clé evolution.derived_hidden, non vide`, () => {
      expect(TONE_MAP[theme]['evolution.derived_hidden']).toBeTruthy();
    });
    it(`${theme} porte la clé evolution.hidden_marker, non vide`, () => {
      expect(TONE_MAP[theme]['evolution.hidden_marker']).toBeTruthy();
    });
  }
});

// Story 32.2 — les trois titres de zone de l'onglet Détails (Action/Consultation/Référence). Même
// garde de parité que ci-dessus (36.11/36.14/31.1) : une clé posée dans un seul thème rendrait
// `undefined` à l'écran dans les deux autres, invisible à tout test de composant (ils tournent tous
// sur le thème par défaut).
describe('Tones — zones de l’onglet Détails de PartieDetail (Story 32.2)', () => {
  const KEYS = [
    'partie.details_zone_action',
    'partie.details_zone_consultation',
    'partie.details_zone_reference',
  ];

  for (const theme of THEMES) {
    it(`${theme} porte les ${KEYS.length} clés, toutes non vides`, () => {
      for (const key of KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }
});

// Story 32.3 — les libellés d'état de scénario et de séance. Même garde de parité que ci-dessus :
// aucun test de composant ne tourne hors du thème par défaut, donc une clé oubliée dans deux
// thèmes sur trois ne rendrait `undefined` qu'à l'écran.
describe('Tones — états de scénario et de séance (Story 32.3)', () => {
  const STATUS_KEYS = [
    'status.scenario_brouillon',
    'status.scenario_a_venir',
    'status.scenario_courant',
    'status.scenario_passe',
    'status.seance_a_planifier',
    'status.seance_answer_poll',
    'status.seance_poll_open',
    'status.seance_inscriptions_ouvertes',
    'status.seance_programmee',
    'status.seance_a_debriefer',
    'status.seance_jouee',
  ];

  for (const theme of THEMES) {
    it(`${theme} porte les ${STATUS_KEYS.length} clés, toutes non vides`, () => {
      for (const key of STATUS_KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });
  }

  // 🚨 Ce sont des noms d'état CONTRACTUELS : ils doivent être rigoureusement les mêmes dans les
  // trois thèmes (Design Notes de la story). Une relecture éditoriale qui « thématiserait » l'un
  // d'eux réintroduirait un troisième vocabulaire d'état — exactement ce que la spec interdit.
  for (const key of STATUS_KEYS) {
    it(`${key} est identique dans les trois thèmes`, () => {
      const values = THEMES.map((t) => TONE_MAP[t][key]);
      expect(new Set(values).size, `${key} → ${values.join(' / ')}`).toBe(1);
    });
  }

  // 🚨 Deux libellés DISTINCTS pour le vote, lisibles sans la teinte : c'est la contrainte
  // d'accessibilité explicite de la story (« deux teintes imposent deux libellés »).
  for (const theme of THEMES) {
    it(`${theme} distingue « réponds au vote » de « vote en cours »`, () => {
      expect(TONE_MAP[theme]['status.seance_answer_poll']).not.toBe(
        TONE_MAP[theme]['status.seance_poll_open'],
      );
    });
  }

  // « Courant », jamais « En cours » : « en cours » est réservé au vote.
  for (const theme of THEMES) {
    it(`${theme} nomme le scénario en cours « Courant »`, () => {
      expect(TONE_MAP[theme]['status.scenario_courant']).toBe('Courant');
    });
  }
});

// Story 34.1 — messages d'échec de connexion. Même garde de parité que ci-dessus : une clé posée
// dans un seul thème rendrait `undefined` à l'écran dans les deux autres. Et, même thématisé,
// chaque texte doit NOMMER sa cause par un mot clair — sans quoi un thème pourrait redevenir
// trompeur (ex. un service indisponible présenté comme des identifiants faux).
describe("Tones — messages d'échec de connexion (Story 34.1)", () => {
  const CAUSE_WORDS: Record<string, string> = {
    'auth.login_invalid': 'invalide',
    'auth.login_reset_required': 'réinitialis',
    'auth.login_throttled': 'tentatives',
    'auth.login_unavailable': 'indisponible',
    'auth.login_unexpected': 'erreur',
  };

  for (const theme of THEMES) {
    it(`${theme} porte les ${Object.keys(CAUSE_WORDS).length} clés, non vides`, () => {
      for (const key of Object.keys(CAUSE_WORDS)) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });

    it(`${theme} nomme la cause de chaque échec par un mot clair`, () => {
      for (const [key, word] of Object.entries(CAUSE_WORDS)) {
        expect(TONE_MAP[theme][key].toLowerCase(), `${theme} / ${key}`).toContain(word);
      }
    });

    it(`${theme} ne parle d'identifiants que pour « identifiants invalides »`, () => {
      for (const key of Object.keys(CAUSE_WORDS)) {
        if (key === 'auth.login_invalid') continue;
        const text = TONE_MAP[theme][key].toLowerCase();
        expect(text, `${theme} / ${key}`).not.toContain('identifiant');
        expect(text, `${theme} / ${key}`).not.toContain('mot de passe incorrect');
      }
    });
  }
});

// Story 34.2 — libellés du bouton de révélation du mot de passe. Garde de parité : une clé posée
// dans un seul thème rendrait `undefined` comme libellé accessible dans les deux autres. Texte
// neutre, identique dans les trois thèmes (un libellé d'accessibilité ne se thématise pas).
describe('Tones — libellés de révélation du mot de passe (Story 34.2)', () => {
  const KEYS = ['auth.password_show', 'auth.password_hide'];

  for (const theme of THEMES) {
    it(`${theme} porte les ${KEYS.length} clés, non vides`, () => {
      for (const key of KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
      }
    });

    it(`${theme} porte le même texte neutre que les autres thèmes`, () => {
      for (const key of KEYS) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBe(TONE_MAP[THEMES[0]][key]);
      }
    });
  }

  it('« afficher » et « masquer » se distinguent', () => {
    for (const theme of THEMES) {
      expect(TONE_MAP[theme]['auth.password_show']).not.toBe(TONE_MAP[theme]['auth.password_hide']);
    }
  });
});

// Story 34.3 — thème de la visite, posé avant le premier rendu d'Angular : le dernier thème connu,
// sinon un tirage équiprobable parmi THEMES, jamais écrit dans le stockage (sinon la visite
// suivante le prendrait pour un thème connu et le tirage cesserait).
describe('ThemeToneService — thème de la visite (Story 34.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
  });

  const themeClasses = () =>
    Array.from(document.body.classList).filter((c) => c.startsWith('theme-'));

  it('thème mémorisé valide : appliqué tel quel, aucun tirage', () => {
    localStorage.setItem('jdr-theme', 'foret-ancienne');
    const random = vi.spyOn(Math, 'random');

    const service = TestBed.inject(ThemeToneService);
    service.applyVisitTheme();

    expect(service.activeTheme()).toBe('foret-ancienne');
    expect(themeClasses()).toEqual(['theme-foret-ancienne']);
    expect(random).not.toHaveBeenCalled();
  });

  for (const [index, theme] of THEMES.entries()) {
    it(`aucun thème mémorisé : le tirage peut donner « ${theme} » (équiprobable parmi THEMES)`, () => {
      vi.spyOn(Math, 'random').mockReturnValue((index + 0.5) / THEMES.length);

      const service = TestBed.inject(ThemeToneService);
      service.applyVisitTheme();

      expect(service.activeTheme()).toBe(theme);
      expect(themeClasses()).toEqual([`theme-${theme}`]);
    });
  }

  it("le thème tiré n'est jamais écrit dans le stockage", () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const service = TestBed.inject(ThemeToneService);
    service.applyVisitTheme();

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem('jdr-theme')).toBeNull();
  });

  it('valeur illisible ou inconnue : traitée comme « aucune information » (tirage), classe résiduelle retirée', () => {
    localStorage.setItem('jdr-theme', 'theme-disparu');
    document.body.classList.add('theme-disparu', 'theme-grimoire-emeraude');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const service = TestBed.inject(ThemeToneService);
    service.applyVisitTheme();

    expect(service.activeTheme()).toBe(THEMES[Math.floor(0.5 * THEMES.length)]);
    expect(themeClasses()).toEqual([`theme-${service.activeTheme()}`]);
    expect(localStorage.getItem('jdr-theme')).toBe('theme-disparu');
  });

  it('stockage indisponible : aucune erreur, un thème est tiré et appliqué, rien écrit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('accès refusé', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const service = TestBed.inject(ThemeToneService);
    expect(() => service.applyVisitTheme()).not.toThrow();

    expect(service.activeTheme()).toBe(THEMES[0]);
    expect(themeClasses()).toEqual([`theme-${THEMES[0]}`]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('setTheme reste le seul à écrire le stockage, et retire toute classe theme-*', () => {
    document.body.classList.add('theme-inconnu');
    const service = TestBed.inject(ThemeToneService);

    service.setTheme('foret-ancienne');

    expect(localStorage.getItem('jdr-theme')).toBe('foret-ancienne');
    expect(themeClasses()).toEqual(['theme-foret-ancienne']);
  });

  it('setTheme ne plante pas si le stockage est indisponible, et applique quand même le thème', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const service = TestBed.inject(ThemeToneService);

    expect(() => service.setTheme('foret-ancienne')).not.toThrow();
    expect(service.activeTheme()).toBe('foret-ancienne');
  });
});

// Story 34.3 — ligne d'orientation de la connexion et messages de validation des formulaires
// d'authentification. Garde de parité : une clé posée dans un seul thème rendrait `undefined` à
// l'écran dans les deux autres. Les messages de validation (`auth.field_*`) restent neutres et
// identiques, ils NOMMENT la règle ; la ligne d'orientation (`auth.login_invite_only`) a, depuis la
// 35.3, la voix de chaque thème (elle doit toujours dire « invitation »).
describe('Tones — validation et orientation des écrans d’authentification (Story 34.3)', () => {
  const RULE_WORDS: Record<string, string> = {
    'auth.login_invite_only': 'invitation',
    'auth.field_required': 'champ',
    'auth.field_email_invalid': 'e-mail',
    'auth.field_pseudo_min': '3 caractères',
    'auth.field_password_min': '8 caractères',
  };

  for (const theme of THEMES) {
    it(`${theme} porte les ${Object.keys(RULE_WORDS).length} clés, non vides, et nomme la règle`, () => {
      for (const [key, word] of Object.entries(RULE_WORDS)) {
        expect(TONE_MAP[theme][key], `${theme} / ${key}`).toBeTruthy();
        expect(TONE_MAP[theme][key].toLowerCase(), `${theme} / ${key}`).toContain(word);
      }
    });
  }

  for (const key of Object.keys(RULE_WORDS).filter((k) => k.startsWith('auth.field_'))) {
    it(`${key} est identique dans les trois thèmes (texte neutre de référence)`, () => {
      const values = THEMES.map((t) => TONE_MAP[t][key]);
      expect(new Set(values).size, `${key} → ${values.join(' / ')}`).toBe(1);
    });
  }
});

describe("Tones — ligne d'orientation de la connexion (Story 35.3)", () => {
  it('auth.login_invite_only a la voix de chaque thème et dit « invitation »', () => {
    const values = THEMES.map((theme) => TONE_MAP[theme]['auth.login_invite_only']);
    expect(new Set(values).size, values.join(' / ')).toBe(THEMES.length);
    for (const value of values) expect(value.toLowerCase()).toContain('invitation');
  });
});

// Story 34.4 — accroche de la bande d'authentification : une clé par thème, texte propre à chaque
// thème (contrairement aux messages de validation de la 34.3, volontairement neutres).
describe('Tones — accroche de la bande d’authentification (Story 34.4)', () => {
  for (const theme of THEMES) {
    it(`${theme} porte auth.tagline, non vide`, () => {
      expect(TONE_MAP[theme]['auth.tagline'], theme).toBeTruthy();
      expect(TONE_MAP[theme]['auth.tagline'].trim(), theme).not.toBe('');
    });
  }

  it('auth.tagline est distincte d’un thème à l’autre', () => {
    const values = THEMES.map((t) => TONE_MAP[t]['auth.tagline']);
    expect(new Set(values).size, values.join(' / ')).toBe(THEMES.length);
  });
});

// Story 35.2 — classement des textes. Une formulation qui se répète vit sous UNE clé `common.*`
// (les voix des trois thèmes sont écrites par la 35.3 : ces clés ne sont plus imposées identiques).
// Les trous `{nom}` doivent être les mêmes partout, sinon `fillTone` laisserait un trou affiché
// dans l'un des thèmes.
describe('Tones — textes migrés au registre (Story 35.2)', () => {
  const REFERENCE = TONE_MAP[THEMES[0]];

  it('les clés communes (`common.*`) existent dans les trois thèmes et ont leur propre voix', () => {
    const communes = Object.keys(REFERENCE).filter((key) => key.startsWith('common.'));
    expect(communes.length).toBeGreaterThan(0);
    // Les mots fonctionnels qui restent identiques sont recensés par NEUTRAL_KEYS (voir plus bas).
    const voix = communes.filter((key) => new Set(THEMES.map((t) => TONE_MAP[t][key])).size > 1);
    expect(voix.length).toBeGreaterThan(communes.length / 2);
  });

  it('les trous `{nom}` d’une clé sont les mêmes dans les trois thèmes', () => {
    const holes = (text: string) => (text.match(/\{[a-z_]+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(REFERENCE)) {
      for (const theme of THEMES) {
        expect(holes(TONE_MAP[theme][key]), `${theme} / ${key}`).toBe(holes(REFERENCE[key]));
      }
    }
  });

  it('aucune valeur du registre n’est vide', () => {
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(TONE_MAP[theme])) {
        expect(value.trim(), `${theme} / ${key}`).not.toBe('');
      }
    }
  });

  it('les libellés orphelins supprimés par la 35.2 ne reviennent pas', () => {
    const orphelines = [
      'dashboard.controls_toggle_aria',
      'dashboard.sort_label',
      'partie.show_troupe',
      'partie.hide_troupe',
      'cta.launch_vote',
      'cta.send_reminder',
      'section.constraints',
      'empty.no_constraints',
      'alert.expiring_soon',
      'status.unavailable_label',
      'status.unknown_label',
      'empty.no_poll',
      'success.date_chosen',
      'character.tab_label',
      'character.portrait_missing',
      'account.save_btn',
      'account.email_change_title',
      // Story 35.3 : les types de partie n'ont plus qu'une série, `partie.kind_*`.
      'core.parties_kind_one_shot',
      'core.parties_kind_campagne',
      'core.parties_kind_campagne_episodique',
      // Story 35.3 : remplacées par une phrase entière par cas (accord dans le registre).
      'calendar.conflict_overwrite_one',
      'calendar.conflict_overwrite_many',
    ];
    for (const theme of THEMES) {
      for (const key of orphelines) {
        expect(Object.keys(TONE_MAP[theme]), `${theme} / ${key}`).not.toContain(key);
      }
    }
  });
});

// Story 35.3 — une voix par thème. Les trois thèmes ne sont plus des copies : chacun tient son
// univers (Grimoire Émeraude : magie et bibliothèque, vouvoiement ; Forêt Ancienne : nature et
// druides, tutoiement ; Atelier Cuivré : engrenages et registres, vouvoiement) de la première à la
// dernière clé. Les textes CONTRACTUELS restent neutres et identiques, et tout autre texte
// identique doit être recensé ici, avec sa raison : un texte qui reste identique par oubli échoue.
describe('Tones — une voix par thème (Story 35.3)', () => {
  /** Clés VOLONTAIREMENT identiques dans les trois thèmes — exactement ces clés, ni plus ni moins.
   *  Une clé qui s'ajoute au registre sans voix propre fait échouer le premier test ; une clé
   *  recensée ici qui reçoit une voix fait échouer le second (la liste ne pourrit pas). */
  const NEUTRAL_KEYS = new Set<string>([
    // Contractuels (spec 35.3) : états, nom propre, accessibilité du mot de passe, règles de champ, badges de l’Agenda
    'auth.field_required',
    'auth.field_email_invalid',
    'auth.field_pseudo_min',
    'auth.field_password_min',
    'auth.password_show',
    'auth.password_hide',
    'status.scenario_brouillon',
    'status.scenario_a_venir',
    'status.scenario_courant',
    'status.scenario_passe',
    'status.seance_a_planifier',
    'status.seance_answer_poll',
    'status.seance_poll_open',
    'status.seance_inscriptions_ouvertes',
    'status.seance_programmee',
    'status.seance_a_debriefer',
    'status.seance_jouee',
    'calendar.agenda.badge_answer_poll',
    'calendar.agenda.badge_poll_open',
    'calendar.agenda.badge_signup',
    'calendar.agenda.badge_signed_up',
    'calendar.agenda.badge_debrief',
    'calendar.agenda.badge_to_seal',
    'character.nature_dragon',
    // Verbatim du contrat d’UI du calendrier (stories 32.2, 36.4, 36.9, 36.14) et noms de vues
    'common.conserver',
    'common.remplacer',
    'common.vue_agenda',
    'common.vue_mois',
    'common.vue_semaine',
    'account.calendar_layer.mes-indisponibilites',
    'account.calendar_layer.mes-disponibilites',
    'account.calendar_layer.mes-seances',
    'account.calendar_layer.votes-en-cours',
    'account.calendar_layer.inscriptions-ouvertes',
    'account.calendar_layer.disponibilite-groupe',
    'account.calendar_intent.disponibilites',
    'account.calendar_intent.seances',
    'account.calendar_intent.votes',
    'account.calendar_intent.groupe',
    'partie.details_zone_action',
    'partie.details_zone_consultation',
    'partie.details_zone_reference',
    'calendar.display.trigger',
    'calendar.display.section_visible',
    'calendar.display.show_legend',
    'calendar.display.filtered_badge',
    'calendar.legend.entry.available',
    'calendar.legend.entry.unavailable',
    'calendar.legend.entry.vote',
    'calendar.legend.entry.group',
    'calendar.legend.entry.none',
    'calendar.view_back',
    'calendar.view_toggle_month_short',
    'calendar.view_toggle_week_short',
    'calendar.view_toggle_agenda_short',
    'calendar.conflict_walkthrough_label',
    'cta.destiny_mode',
    // Vocabulaire du système de jeu (Ryuutama) : noms de fiches, de rubriques et de catégories
    'partie.asset_journal_cta',
    'partie.asset_carte_cta',
    'partie.asset_monde_cta',
    'partie.asset_monstre_cta',
    'partie.asset_ville_cta',
    'partie.asset_objectif_chasse_cta',
    'partie.asset_objectif_quete_cta',
    'partie.asset_objectif_voyage_cta',
    'partie.asset_oeuf_de_bataille_cta',
    'partie.asset_structure_cta',
    'my_characters.sort_niveau',
    'character.level_badge',
    'characters_sheet.history_level',
    'characters_sheet.levelup_title_level',
    'roster.mj_badge',
    'character.choice_talents_label',
    'character.choice_advantages_label',
    'character.choice_reference_toggle',
    'character.recap_total',
    'detail.row_attributes',
    'detail.row_difficulty',
    'detail.row_effect',
    'detail.row_conditions',
    'character.equipment_group_individual',
    'character.equipment_group_contenant',
    'character.equipment_group_animal',
    'characters_wizard.attributes_profile_aria',
    'characters_wizard.attributes_banner_profile',
    'hd.sheet_export_editable',
    'hd.sheet_export_2pages',
    // Mots fonctionnels courts : états de disponibilité, réponses de vote, champs, bornes, unités
    'common.au',
    'common.disponible',
    'common.du',
    'common.heure',
    'common.indisponible',
    'common.lieu',
    'common.non',
    'common.oui',
    'common.peut_etre',
    'common.poids',
    'common.seance_n',
    'common.title_seance_index',
    'common.titre',
    'calendar.agg_available_title',
    'calendar.agg_unknown_title',
    'calendar.agg_unavailable_title',
    'calendar.view_group_unavailable_detail',
    'calendar.view_selection_one',
    'calendar.month_cell_instructions',
    'calendar.month_day_today_aria',
    'calendar.week_decl_available',
    'calendar.week_decl_punctual',
    'calendar.week_decl_recurring',
    'calendar.week_decl_unavailable',
    'calendar.week_status_available',
    'calendar.week_status_unavailable',
    'calendar.week_status_unknown',
    'calendar.util_answer_yes',
    'calendar.util_answer_maybe',
    'calendar.util_answer_no',
    'calendar.util_group_unavailable_one',
    'calendar.util_group_unavailable_many',
    'calendar.util_word_no_answer',
    'calendar.util_counter',
    'calendar.constraint_end_date',
    'calendar.constraint_kind_aria',
    'calendar.constraint_start_date',
    'calendar.conflict_kind_available',
    'calendar.conflict_kind_unavailable',
    'calendar.compose_confirm_responses_many',
    'calendar.compose_confirm_responses_one',
    // Gabarits structurels et libellés techniques
    'partie.signal_more_count',
    'parties.detail_link_expires_short',
    'parties.roster_aria_character',
    'parties.roster_aria_character_class',
    'parties.roster_aria_create',
    'portrait.cropper_zoom',
    'portrait.avatar_aria',
    'portrait.avatar_aria_empty',
  ]);

  const REFERENCE = TONE_MAP['grimoire-emeraude'];
  const identicalKeys = () =>
    Object.keys(REFERENCE).filter(
      (key) => new Set(THEMES.map((theme) => TONE_MAP[theme][key])).size === 1,
    );

  it('aucune clé n’est identique dans les trois thèmes, hors des textes neutres recensés', () => {
    const oubliees = identicalKeys().filter((key) => !NEUTRAL_KEYS.has(key));
    expect(oubliees, `clés restées en libellé générique : ${oubliees.join(', ')}`).toEqual([]);
  });

  it('chaque texte neutre recensé existe et est réellement identique dans les trois thèmes', () => {
    const identiques = new Set(identicalKeys());
    for (const key of NEUTRAL_KEYS) {
      expect(Object.keys(REFERENCE), key).toContain(key);
      expect(identiques.has(key), `${key} a désormais une voix : le retirer de NEUTRAL_KEYS`).toBe(
        true,
      );
    }
  });

  it('les textes contractuels sont neutres et identiques dans les trois thèmes', () => {
    const contractuelles = Object.keys(REFERENCE).filter(
      (key) =>
        key.startsWith('status.') ||
        key === 'character.nature_dragon' ||
        key.startsWith('auth.password_') ||
        key.startsWith('auth.field_') ||
        key.startsWith('calendar.agenda.badge_'),
    );
    expect(contractuelles.length).toBe(24);
    for (const key of contractuelles) {
      const values = THEMES.map((theme) => TONE_MAP[theme][key]);
      expect(new Set(values).size, `${key} → ${values.join(' / ')}`).toBe(1);
    }
  });

  // Les clés les plus vues (navigation, authentification, tableau de bord, partie, calendrier,
  // vote, personnages, Homme Dragon) : aucun thème ne dit la même chose qu'un autre.
  const HIGH_VISIBILITY = [
    'nav.my_games',
    'nav.create_game',
    'nav.logout',
    'nav.calendar',
    'nav.account',
    'nav.characters',
    'auth.tagline',
    'auth.login_invalid',
    'auth.login_reset_required',
    'auth.login_throttled',
    'auth.login_unavailable',
    'auth.login_identifier_label',
    'auth.login_submit',
    'auth.login_forgot_link',
    'auth.login_invite_only',
    'auth.register_submit',
    'auth.forgot_sent',
    'auth.forgot_submit',
    'auth.reset_submit',
    'common.connexion',
    'common.creer_un_compte',
    'common.mot_de_passe',
    'common.mot_de_passe_oublie',
    'common.nouveau_mot_de_passe',
    'common.lien_invalide',
    'common.retour_a_la_connexion',
    'common.annuler',
    'common.enregistrer',
    'common.supprimer',
    'common.confirmer',
    'common.valider',
    'common.chargement',
    'common.rechercher',
    'common.fermer',
    'dashboard.title_invitations',
    'dashboard.empty',
    'dashboard.role_mj',
    'dashboard.role_player',
    'dashboard.section_awaiting',
    'dashboard.section_upcoming',
    'dashboard.section_finished',
    'dashboard.sort_urgence',
    'dashboard.favorite_add_aria',
    'partie.new_title',
    'partie.save_btn',
    'partie.name_label',
    'partie.kind_ONE_SHOT',
    'partie.kind_CAMPAGNE_LINEAIRE',
    'partie.kind_CAMPAGNE_EPISODIQUE',
    'partie.signal_vote_en_cours_sans_reponse',
    'partie.signal_aucune_date_ni_vote',
    'partie.delete_btn',
    'parties.detail_tab_scenario',
    'parties.detail_delete_confirm',
    'scenarios.list_title',
    'scenarios.form_title',
    'scenarios.editor_close',
    'scenarios.seances_inscrire',
    'scenarios.seances_desinscrire',
    'calendar.agenda.section_awaiting',
    'calendar.agenda.empty',
    'calendar.agenda.poll_open',
    'calendar.agenda.no_date',
    'calendar.legend.title',
    'calendar.view_no_poll',
    'calendar.view_compose_arm',
    'calendar.conflict_intent_prefix',
    'calendar.conflict_title_many',
    'calendar.conflict_overwrite_available_many',
    'calendar.compose_count_many',
    'calendar.selbar_count_many',
    'cta.withdraw_vote',
    'poll.status_title',
    'pollui.creation_title',
    'pollui.creation_submit',
    'announcement.publish_cta',
    'my_characters.title',
    'character.create_cta',
    'evolution.levelup_cta',
    'evolution.inventory_section_title',
    'roster.invite_slot',
    'hd.creation_page_title',
    'homme-dragon.created_notice',
    'account.title',
    'account.password_title',
    'characters_wizard.step_progress',
    'characters_wizard.summary_default_title',
  ];

  it('les clés de grande visibilité existent et sont toutes distinctes d’un thème à l’autre', () => {
    for (const key of HIGH_VISIBILITY) {
      expect(Object.keys(REFERENCE), key).toContain(key);
      const values = THEMES.map((theme) => TONE_MAP[theme][key]);
      expect(new Set(values).size, `${key} → ${values.join(' / ')}`).toBe(THEMES.length);
    }
  });

  // Forme d'adresse : une seule par thème, de la première à la dernière clé. Les textes contractuels
  // sont exclus (neutres, ils gardent leur forme d'origine : « Réponds au vote »).
  const isContractual = (key: string) =>
    key.startsWith('status.') ||
    key === 'character.nature_dragon' ||
    key.startsWith('auth.password_') ||
    key.startsWith('auth.field_') ||
    key.startsWith('calendar.agenda.badge_');
  const VOUVOIEMENT =
    /(^|[^\p{L}])(vous|votre|vos)(?=$|[^\p{L}])|-vous(?=$|[^\p{L}])|(^|[^\p{L}])(réessayez|rechargez|vérifiez|choisissez|ouvrez|créez|connectez|terminez|refaites|patientez|utilisez|acceptez|cochez|cliquez|revalidez|demandez|revenez|touchez|répartissez|gravez|ajoutez|sélectionnez|renseignez|veuillez|rédigez|déverrouillez|rouvrez|consultez|plantez|façonnez)(?=$|[^\p{L}])/iu;
  // Impératifs du tutoiement, restreints aux formes sans ambiguïté (« ouvre » est aussi un « il ouvre »).
  const TUTOIEMENT_PRONOMS =
    /(^|[^\p{L}])((tu|toi|ton|ta|tes|te)(?=$|[^\p{L}])|t[’'](?=\p{L}))|-toi(?=$|[^\p{L}])/iu;
  const TUTOIEMENT_IMPERATIFS =
    /(^|[^\p{L}])(réessaie|vérifie|choisis|refais|patiente|accepte|coche|clique|revalide|reviens|répartis|déverrouille|saisis|renseigne|prends)(?=$|[^\p{L}])/iu;

  for (const theme of ['grimoire-emeraude', 'atelier-cuivre'] as const) {
    it(`${theme} vouvoie partout — aucun « tu », « ton », « réessaie »… hors textes contractuels`, () => {
      for (const [key, value] of Object.entries(TONE_MAP[theme])) {
        if (isContractual(key)) continue;
        expect(TUTOIEMENT_PRONOMS.test(value), `${theme} / ${key} → ${value}`).toBe(false);
        expect(TUTOIEMENT_IMPERATIFS.test(value), `${theme} / ${key} → ${value}`).toBe(false);
      }
    });
  }

  it('foret-ancienne tutoie partout — aucun « vous », « votre », « réessayez »… hors textes contractuels', () => {
    for (const [key, value] of Object.entries(TONE_MAP['foret-ancienne'])) {
      if (isContractual(key)) continue;
      expect(VOUVOIEMENT.test(value), `foret-ancienne / ${key} → ${value}`).toBe(false);
      // Un impératif en « -ez » (hors « chez », « assez »…) trahit un vouvoiement.
      const imperatifs = (
        value.replace(/laissez-passer/gi, 'passe-droit').match(/[\p{L}]+ez(?![\p{L}])/giu) ?? []
      ).filter((mot) => !/^(chez|assez|nez|rez)$/i.test(mot));
      expect(imperatifs, `foret-ancienne / ${key} → ${value}`).toEqual([]);
    }
  });

  it('chaque thème parle son propre vocabulaire, sur une part substantielle du registre', () => {
    const univers: Record<Theme, RegExp> = {
      'grimoire-emeraude':
        /grimoire|parchemin|oracle|sceau|sortilège|missive|enlumin|chapitre|voyageur|compagnon|chronique|almanach|folio|conseil|proclam|inscri|scell|glose|coffre|maître|forg/i,
      'foret-ancienne':
        /sentier|forêt|clairière|cercle|écureuil|hibou|besace|carnet|étape|lune|racine|grav|plant|éveil|parole|guide|habitant|cueill|pécule|feuille|compagnon/i,
      'atelier-cuivre':
        /mission|opération|registre|automate|pneumatique|scrutin|consign|équipage|mécanicien|atelier|plaque|badge|composant|calibr|vapeur|purg|ingénieur|établi|fréquence|télégramme|assembl|soute|chargement|rouage/i,
    };
    for (const theme of THEMES) {
      const total = Object.values(TONE_MAP[theme]);
      const marques = total.filter((value) => univers[theme].test(value));
      expect(marques.length, `${theme} : ${marques.length}/${total.length}`).toBeGreaterThan(
        total.length * 0.35,
      );
    }
  });

  it('la connexion ne distingue jamais « compte inexistant » de « mot de passe incorrect »', () => {
    for (const theme of THEMES) {
      const text = TONE_MAP[theme]['auth.login_invalid'].toLowerCase();
      expect(text, theme).not.toMatch(/inexistant|introuvable|inconnu|n’existe pas|incorrect/);
      expect(text, theme).toContain('invalide');
    }
  });

  it('un lien invalide le dit, dans chaque thème (une erreur nomme sa cause)', () => {
    for (const theme of THEMES) {
      expect(TONE_MAP[theme]['common.lien_invalide'].toLowerCase(), theme).toContain('invalide');
      expect(
        TONE_MAP[theme][
          'common.lien_invalide_ou_expire_merci_de_refaire_une_demande'
        ].toLowerCase(),
        theme,
      ).toContain('expiré');
      expect(TONE_MAP[theme]['auth.rollback_error'].toLowerCase(), theme).toContain('expiré');
    }
  });

  // La boîte de conflit construit ces clés dynamiquement (`calendar.conflict_overwrite_${kind}_${n}`) :
  // aucune recherche de la clé complète ne les trouve, ce test est donc leur seule garde.
  it('les quatre phrases « Remplacer » de la boîte de conflit existent, non vides, dans chaque thème', () => {
    for (const theme of THEMES) {
      for (const kind of ['available', 'unavailable']) {
        for (const nombre of ['one', 'many']) {
          const key = `calendar.conflict_overwrite_${kind}_${nombre}`;
          expect(TONE_MAP[theme][key]?.trim(), `${theme} / ${key}`).toBeTruthy();
        }
      }
    }
  });

  it('le lien « mot de passe oublié » cité par le message de réinitialisation est celui du thème', () => {
    for (const theme of THEMES) {
      const lien = TONE_MAP[theme]['auth.login_forgot_link'];
      expect(TONE_MAP[theme]['auth.login_reset_required'], theme).toContain(`« ${lien} »`);
    }
  });

  it('les types de partie ont une seule série de libellés : `partie.kind_*`', () => {
    for (const theme of THEMES) {
      expect(
        Object.keys(TONE_MAP[theme]).filter((key) => key.startsWith('core.parties_kind_')),
      ).toEqual([]);
      for (const kind of ['ONE_SHOT', 'CAMPAGNE_LINEAIRE', 'CAMPAGNE_EPISODIQUE']) {
        expect(TONE_MAP[theme][`partie.kind_${kind}`], `${theme} / ${kind}`).toBeTruthy();
      }
    }
  });

  it('le mot « vote » des paires d’état reste distinct : « Réponds au vote » ≠ « Vote en cours »', () => {
    for (const theme of THEMES) {
      expect(TONE_MAP[theme]['calendar.agenda.badge_answer_poll'], theme).not.toBe(
        TONE_MAP[theme]['calendar.agenda.badge_poll_open'],
      );
      // Le signal du tableau de bord reprend la même paire : jamais « Vote en attente ».
      expect(TONE_MAP[theme]['partie.signal_vote_en_cours_sans_reponse'], theme).not.toMatch(
        /en attente/i,
      );
    }
  });
});
