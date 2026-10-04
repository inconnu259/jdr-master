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
