import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { BreakpointObserver } from '@angular/cdk/layout';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { GameSystemContentDto, HommeDragonDto } from '@master-jdr/shared';
import { HommeDragonSheet } from './homme-dragon-sheet';
import { HommeDragonService } from '../../../core/homme-dragon/homme-dragon.service';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const CATALOG: GameSystemContentDto = {
  hommeDragonArtefact: [
    {
      key: 'encyclopedie',
      data: { key: 'encyclopedie', label: 'Encyclopédie', race: 'DRAGON_VERT' },
    },
    { key: 'lanterne', data: { key: 'lanterne', label: 'Lanterne', race: 'DRAGON_VERT' } },
    { key: 'sextant', data: { key: 'sextant', label: 'Sextant', race: 'DRAGON_VERT' } },
    {
      key: 'grand-arc',
      data: {
        key: 'grand-arc',
        label: 'Grand arc',
        race: 'DRAGON_ROUGE',
        description: 'Le grand arc force ses cibles à se déplacer constamment.',
      },
    },
    {
      key: 'grande-epee',
      data: { key: 'grande-epee', label: 'Grande épée', race: 'DRAGON_ROUGE' },
    },
    {
      key: 'grande-lance',
      data: { key: 'grande-lance', label: 'Grande lance', race: 'DRAGON_ROUGE' },
    },
  ],
  eveilPower: [
    {
      key: 'escorte-du-dragon',
      data: {
        key: 'escorte-du-dragon',
        label: 'Escorte du dragon',
        ps: 2,
        description: "L'homme-dragon guide les voyageurs perdus.",
      },
    },
    { key: 'couche-du-dragon', data: { key: 'couche-du-dragon', label: 'Couche du dragon' } },
  ],
  // Story 33.2 — même forme que `souffles.json` (21 souffles de `docs/dragons.md`), descriptions
  // abrégées : le contenu exact est une affaire de revue de contenu, pas de ce test.
  souffle: [
    souffle('passe', 'Passé', { famille: 'temps', ps: 2, reservable: false }, 'Remonte le temps.'),
    souffle('futur', 'Futur', { famille: 'temps', ps: 2, reservable: false }, 'Accélère le temps.'),
    souffle('chance', 'Chance', { famille: 'destin' }, 'Réussite critique automatique.'),
    souffle('malchance', 'Malchance', { famille: 'destin' }, 'Double 1 automatique.'),
    souffle('ennemi-jure', 'Ennemi juré', { famille: 'pnj' }, 'Le monstre ajoute (niv. × 3) PV.'),
    souffle('nuee-grouillante', 'Nuée grouillante', { famille: 'pnj' }, 'Un monstre unique.'),
    souffle('guet-apens', 'Guet-apens', { famille: 'pnj' }, 'Attaques des PNJ réussies.'),
    souffle('retrouvailles', 'Retrouvailles', { famille: 'pnj' }, "Le PNJ n'est pas mort."),
    souffle('fuite', 'Fuite', { famille: 'pnj' }, 'Un PNJ réussit à fuir.'),
    souffle('nostalgie', 'Nostalgie', { race: 'DRAGON_VERT' }, 'Guérit deux voyageurs.'),
    souffle('route', 'Route', { race: 'DRAGON_VERT' }, 'Ignore les modificateurs de climat.'),
    souffle('voyage', 'Voyage', { race: 'DRAGON_VERT' }, 'Prime de 300 Po × niveau.'),
    souffle('amour', 'Amour', { race: 'DRAGON_BLEU' }, 'Un point de protection.'),
    souffle('bonte', 'Bonté', { race: 'DRAGON_BLEU' }, "Un cran d'Esprit."),
    souffle('emotion', 'Émotion', { race: 'DRAGON_BLEU' }, 'Cinq jetons au meneur.'),
    souffle('defi', 'Défi', { race: 'DRAGON_ROUGE' }, 'Un cran de VIG face à un rival.'),
    souffle('courage', 'Courage', { race: 'DRAGON_ROUGE' }, 'Un voyageur revient à la vie.'),
    souffle('renaissance', 'Renaissance', { race: 'DRAGON_ROUGE' }, "Un cran d'attribut."),
    souffle('massacre', 'Massacre', { race: 'DRAGON_NOIR' }, '2 PE par animal tué.'),
    souffle('obeissance', 'Obéissance', { race: 'DRAGON_NOIR' }, 'Bonus au test de condition.'),
    souffle('vengeance', 'Vengeance', { race: 'DRAGON_NOIR' }, 'Bonus au toucher.'),
  ],
};

function souffle(
  key: string,
  label: string,
  extra: { famille?: string; race?: string; ps?: number; reservable?: boolean },
  description?: string,
) {
  return { key, data: { key, label, ps: 1, ...extra, ...(description ? { description } : {}) } };
}

const COMMON_SOUFFLE_LABELS = [
  'Passé',
  'Futur',
  'Chance',
  'Malchance',
  'Ennemi juré',
  'Nuée grouillante',
  'Guet-apens',
  'Retrouvailles',
  'Fuite',
];

/** Story 33.1 — même patron que `character-sheet.spec.ts`/`detail-surface.spec.ts` : jsdom
 *  n'implémente pas `matchMedia`, `BreakpointObserver` doit donc être mocké dès que
 *  `<app-detail-surface>` est effectivement monté (ouverture d'une surface de détail). */
function makeBreakpointObserver(desktop = false) {
  return {
    isMatched: () => desktop,
    observe: () => of({ matches: desktop, breakpoints: {} }),
  };
}

function makeDto(overrides: Partial<HommeDragonDto> = {}): HommeDragonDto {
  return {
    id: 'hd1',
    userId: 'mj1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grand-arc' }, nom: 'Ignis' },
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    voyageursProteges: [],
    historique: [],
    derived: { level: 1, PS: 3 },
    eveilPowers: [],
    pendingEveilLevels: [],
    ...overrides,
  };
}

function makeHommeDragonService(
  findOneResult: HommeDragonDto | null = null,
  overrides: Partial<{ changed: ReturnType<typeof signal<number>> }> = {},
) {
  return {
    findOne: vi.fn().mockResolvedValue(findOneResult),
    create: vi.fn(),
    update: vi.fn(),
    chooseEveilPower: vi.fn(),
    exportPdf: vi.fn(),
    // Story 20.2 (Task 3) : HommeDragonSheet réagit désormais à ce signal (effect() du constructeur).
    changed: signal(0),
    ...overrides,
  };
}

function makeCharacterService(catalog: GameSystemContentDto = CATALOG) {
  return { getGameSystemContent: vi.fn().mockResolvedValue(catalog) };
}

function makeThemeService() {
  return {
    tone: () => ({
      'homme-dragon.create_cta': 'Créer mon Homme Dragon',
      'homme-dragon.race_label': 'Race',
      'homme-dragon.artefact_label': 'Artefact',
      'homme-dragon.created_notice': 'Votre Homme Dragon a pris vie.',
    }),
  };
}

async function createComponent(
  hommeDragonSvc = makeHommeDragonService(null),
  characterSvc = makeCharacterService(),
  desktop = false,
) {
  await TestBed.configureTestingModule({
    imports: [HommeDragonSheet],
    providers: [
      { provide: HommeDragonService, useValue: hommeDragonSvc },
      { provide: CharacterService, useValue: characterSvc },
      { provide: ThemeToneService, useValue: makeThemeService() },
      { provide: BreakpointObserver, useValue: makeBreakpointObserver(desktop) },
      provideNoopAnimations(),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(HommeDragonSheet);
  fixture.componentRef.setInput('partieId', 'p1');
  fixture.componentRef.setInput('partieName', 'Ma Campagne');
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, hommeDragonSvc, characterSvc };
}

describe('HommeDragonSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aucun Homme Dragon existant → formulaire de création affiché, mondesProteges pré-rempli avec le nom de la Partie (AC1)', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;

    expect(component['hommeDragon']()).toBeNull();
    expect(component['mondesProteges']()).toBe('Ma Campagne');
    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__create-form'))).toBeTruthy();
  });

  it('mondesProteges pré-rempli reste éditable', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;

    component['mondesProteges'].set('Un autre monde');
    expect(component['mondesProteges']()).toBe('Un autre monde');
  });

  it('artefacts proposés filtrés à la race sélectionnée (AC1)', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;

    component['onRaceChange']('DRAGON_VERT');
    fixture.detectChanges();

    const keys = component['artefactsForRace']().map((a) => a.key);
    expect(keys).toEqual(['encyclopedie', 'lanterne', 'sextant']);
    expect(keys).not.toContain('grand-arc');
  });

  it('changement de race réinitialise l’artefact déjà choisi', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;

    component['onRaceChange']('DRAGON_ROUGE');
    component['artefactKey'].set('grand-arc');
    component['onRaceChange']('DRAGON_VERT');

    expect(component['artefactKey']()).toBeNull();
  });

  it('bouton de soumission désactivé tant que race/artefact/nom ne sont pas tous renseignés', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;

    expect(component['isValid']()).toBe(false);
    component['onRaceChange']('DRAGON_ROUGE');
    expect(component['isValid']()).toBe(false);
    component['artefactKey'].set('grand-arc');
    expect(component['isValid']()).toBe(false);
    component['nom'].set('Ignis');
    expect(component['isValid']()).toBe(true);
  });

  it('soumission valide appelle create() avec le sheetData complet (AC1)', async () => {
    const hommeDragonSvc = makeHommeDragonService(null);
    hommeDragonSvc.create.mockResolvedValue(makeDto());
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    component['onRaceChange']('DRAGON_ROUGE');
    component['artefactKey'].set('grand-arc');
    component['nom'].set('Ignis');
    await component['onSubmit']();

    expect(hommeDragonSvc.create).toHaveBeenCalledWith('p1', {
      race: 'DRAGON_ROUGE',
      artefact: { key: 'grand-arc' },
      nom: 'Ignis',
      apparence: undefined,
      caractere: undefined,
      vocation: undefined,
      demeure: undefined,
      avatar: undefined,
      mondesProteges: 'Ma Campagne',
    });
    expect(component['hommeDragon']()).toEqual(makeDto());
    expect(component['justCreated']()).toBe(true);
  });

  it('création rejetée (409) → error() renseigné, formulaire non cassé', async () => {
    const hommeDragonSvc = makeHommeDragonService(null);
    hommeDragonSvc.create.mockRejectedValue(new Error('409'));
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    component['onRaceChange']('DRAGON_ROUGE');
    component['artefactKey'].set('grand-arc');
    component['nom'].set('Ignis');
    await component['onSubmit']();

    expect(component['createError']()).toBeTruthy();
    expect(component['hommeDragon']()).toBeNull();
    expect(component['creating']()).toBe(false);
  });

  it('Homme Dragon déjà existant → fiche affichée directement, pas de formulaire de création', async () => {
    const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
    const component = fixture.componentInstance;

    expect(component['hommeDragon']()).toEqual(makeDto());
    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__create-form'))).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('Ignis');
  });

  it('champs libres (apparence, caractère, vocation, demeure, avatar, mondesProteges) affichés sur la fiche existante (Story 33.1)', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(
        makeDto({
          sheetData: {
            race: 'DRAGON_ROUGE',
            artefact: { key: 'grand-arc' },
            nom: 'Ignis',
            apparence: 'Écailles cuivrées',
            caractere: 'Bourru mais loyal',
            vocation: 'Guide de caravane',
            demeure: 'Une grotte au bord du fleuve',
            avatar: 'Vieil homme à la barbe rousse',
            mondesProteges: 'Terra Nova',
          },
        }),
      ),
    );

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Écailles cuivrées');
    expect(text).toContain('Bourru mais loyal');
    expect(text).toContain('Guide de caravane');
    expect(text).toContain('Une grotte au bord du fleuve');
    expect(text).toContain('Vieil homme à la barbe rousse');
    expect(text).toContain('Terra Nova');
  });

  it('nom absent → repli affiché, même convention que characterName() (Story 33.1)', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(
        makeDto({ sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grand-arc' }, nom: '' } }),
      ),
    );
    const component = fixture.componentInstance;

    expect(component['displayName']()).toBe('Homme Dragon sans nom');
    expect(fixture.nativeElement.textContent).toContain('Homme Dragon sans nom');
  });

  it("changement d'artefact (AC4) appelle update() et met à jour la fiche affichée", async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto());
    hommeDragonSvc.update.mockResolvedValue(
      makeDto({
        sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grande-epee' }, nom: 'Ignis' },
      }),
    );
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    component['openArtefactEdit']();
    component['editArtefactKey'].set('grande-epee');
    await component['onArtefactSubmit']();

    expect(hommeDragonSvc.update).toHaveBeenCalledWith('p1', { artefact: { key: 'grande-epee' } });
    expect(component['hommeDragon']()?.sheetData.artefact.key).toBe('grande-epee');
    expect(component['editingArtefact']()).toBe(false);
  });

  it('revue de code : échec de findOne()/getGameSystemContent() au chargement → loadError() renseigné, jamais le formulaire de création (évite une double-création)', async () => {
    const hommeDragonSvc = {
      findOne: vi.fn().mockRejectedValue(new Error('network')),
      create: vi.fn(),
      update: vi.fn(),
      chooseEveilPower: vi.fn(),
      exportPdf: vi.fn(),
      changed: signal(0),
    };
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    expect(component['loadError']()).toBeTruthy();
    expect(component['hommeDragon']()).toBeUndefined();
    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__create-form'))).toBeFalsy();
  });

  it("revue de code : ouvrir l'édition d'artefact referme le bandeau « fiche créée »", async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto());
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;
    component['justCreated'].set(true);

    component['openArtefactEdit']();

    expect(component['justCreated']()).toBe(false);
  });

  it('voyageurs protégés et historique affichés sur la fiche existante (AC1, Story 10.2)', async () => {
    const dto = makeDto({
      voyageursProteges: [
        { userId: 'u1', pseudo: 'alice' },
        { userId: 'u2', pseudo: 'bob' },
      ],
      historique: [
        {
          scenarioTitle: 'Le Marché aux Ombres',
          date: '2026-07-10T00:00:00.000Z',
          participants: ['alice', 'bob'],
        },
      ],
    });
    const { fixture } = await createComponent(makeHommeDragonService(dto));

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('alice');
    expect(text).toContain('bob');
    expect(text).toContain('Le Marché aux Ombres');
  });

  it('voyageursProteges vide → état vide, pas de liste', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(makeDto({ voyageursProteges: [] })),
    );

    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__voyageurs ul'))).toBeFalsy();
    expect(fixture.nativeElement.textContent as string).toContain('Aucun voyageur');
  });

  it('historique vide → état vide, pas de liste (AC2)', async () => {
    const { fixture } = await createComponent(makeHommeDragonService(makeDto({ historique: [] })));

    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__historique ul'))).toBeFalsy();
    expect(fixture.nativeElement.textContent as string).toContain('Aucun scénario joué');
  });

  it('niveau et Points de Souffle affichés sur la fiche existante (AC1, AC2, Story 10.3)', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(makeDto({ derived: { level: 3, PS: 5 } })),
    );

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Niveau : 3');
    expect(text).toContain('Points de Souffle : 5');
  });

  it('aucun élément interactif dans la section niveau/PS — lecture seule, aucun forçage possible (AC4)', async () => {
    const { fixture } = await createComponent(makeHommeDragonService(makeDto()));

    const section = fixture.debugElement.query(By.css('.homme-dragon-sheet__derived'));
    expect(section).toBeTruthy();
    expect(section.query(By.css('input, select, button'))).toBeFalsy();
  });

  it('pendingEveilLevels non vide → prompt affiché, sélecteur peuplé des pouvoirs non encore choisis (AC1)', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(makeDto({ pendingEveilLevels: [2] })),
    );

    const prompt = fixture.debugElement.query(By.css('.homme-dragon-sheet__eveil-prompt'));
    expect(prompt).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Niveau 2 atteint');
    const options = prompt
      .queryAll(By.css('option'))
      .map((o) => o.nativeElement.textContent.trim());
    expect(options).toContain('Escorte du dragon');
    expect(options).toContain('Couche du dragon');
  });

  it('pendingEveilLevels vide → aucun prompt affiché (AC2)', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(makeDto({ pendingEveilLevels: [] })),
    );

    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__eveil-prompt'))).toBeFalsy();
  });

  it('confirmation du choix appelle chooseEveilPower() avec le bon level/key et met à jour la fiche affichée', async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto({ pendingEveilLevels: [2] }));
    hommeDragonSvc.chooseEveilPower.mockResolvedValue(
      makeDto({
        pendingEveilLevels: [],
        eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }],
      }),
    );
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    component['selectedEveilPowerKey'].set('escorte-du-dragon');
    await component['onChooseEveilPower']();

    expect(hommeDragonSvc.chooseEveilPower).toHaveBeenCalledWith('p1', {
      level: 2,
      key: 'escorte-du-dragon',
    });
    expect(component['hommeDragon']()?.eveilPowers).toEqual([
      { level: 2, key: 'escorte-du-dragon' },
    ]);
    expect(component['selectedEveilPowerKey']()).toBeNull();
  });

  it('AC3 : après un choix, le prompt avance automatiquement au niveau en attente suivant', async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto({ pendingEveilLevels: [2, 3] }));
    hommeDragonSvc.chooseEveilPower.mockResolvedValue(
      makeDto({
        pendingEveilLevels: [3],
        eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }],
      }),
    );
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    expect(component['currentPendingLevel']()).toBe(2);
    component['selectedEveilPowerKey'].set('escorte-du-dragon');
    await component['onChooseEveilPower']();
    fixture.detectChanges();

    expect(component['currentPendingLevel']()).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Niveau 3 atteint');
  });

  it('eveilPowers non vide → liste affichée avec les libellés résolus, pas les clés', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(makeDto({ eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }] })),
    );

    const section = fixture.debugElement.query(By.css('.homme-dragon-sheet__eveil-powers'));
    expect(section).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Escorte du dragon');
    expect(fixture.nativeElement.textContent).not.toContain('escorte-du-dragon');
  });

  it('échec de chooseEveilPower() → eveilPowerError() renseigné, formulaire non cassé', async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto({ pendingEveilLevels: [2] }));
    hommeDragonSvc.chooseEveilPower.mockRejectedValue(new Error('500'));
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    component['selectedEveilPowerKey'].set('escorte-du-dragon');
    await component['onChooseEveilPower']();

    expect(component['eveilPowerError']()).toBeTruthy();
    expect(component['choosingEveilPower']()).toBe(false);
  });

  it('clic sur "Exporter en PDF" appelle exportPdf() avec le bon partieId et déclenche un téléchargement', async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto());
    hommeDragonSvc.exportPdf.mockResolvedValue(new Blob(['%PDF-1.6'], { type: 'application/pdf' }));
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    await component['onExportPdf']();

    expect(hommeDragonSvc.exportPdf).toHaveBeenCalledWith('p1');
    expect(component['exportError']()).toBeNull();
    expect(component['exporting']()).toBe(false);
  });

  it('échec de exportPdf() → exportError() renseigné, formulaire non cassé', async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto());
    hommeDragonSvc.exportPdf.mockRejectedValue(new Error('network down'));
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    await component['onExportPdf']();

    expect(component['exportError']()).toBeTruthy();
    expect(component['exporting']()).toBe(false);
  });

  describe('Surface de détail (Story 33.1)', () => {
    it('artefact sans nom/inscription personnalisés → le déclencheur affiche le label/description du catalogue (desktop)', async () => {
      const { fixture } = await createComponent(
        makeHommeDragonService(
          makeDto({
            sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grand-arc' }, nom: 'Ignis' },
          }),
        ),
        makeCharacterService(),
        true,
      );
      const component = fixture.componentInstance;

      const trigger = fixture.debugElement
        .queryAll(By.css('.homme-dragon-sheet__detail-trigger'))
        .find((el) => (el.nativeElement.textContent as string).includes('Grand arc'));
      expect(trigger).toBeTruthy();

      trigger!.triggerEventHandler('click', new MouseEvent('click'));
      fixture.detectChanges();

      expect(component['detail'].selected()).toEqual({
        title: 'Grand arc',
        body: 'Le grand arc force ses cibles à se déplacer constamment.',
      });
    });

    it('artefact avec nom/inscription personnalisés du MJ → le déclencheur utilise ces valeurs en priorité', async () => {
      const { fixture } = await createComponent(
        makeHommeDragonService(
          makeDto({
            sheetData: {
              race: 'DRAGON_ROUGE',
              artefact: {
                key: 'grand-arc',
                nom: 'Arc de braise',
                inscription: 'Gravé par un ancien voyageur.',
              },
              nom: 'Ignis',
            },
          }),
        ),
      );
      const component = fixture.componentInstance;

      const trigger = fixture.debugElement
        .queryAll(By.css('.homme-dragon-sheet__detail-trigger'))
        .find((el) => (el.nativeElement.textContent as string).includes('Arc de braise'));
      expect(trigger).toBeTruthy();

      trigger!.triggerEventHandler('click', new MouseEvent('click'));
      fixture.detectChanges();

      expect(component['detail'].selected()).toEqual({
        title: 'Arc de braise',
        body: 'Gravé par un ancien voyageur.',
      });
    });

    it('artefact sans description au catalogue et sans inscription → aucun déclencheur, texte simple', async () => {
      const { fixture } = await createComponent(
        makeHommeDragonService(
          makeDto({
            sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grande-epee' }, nom: 'Ignis' },
          }),
        ),
      );

      const trigger = fixture.debugElement
        .queryAll(By.css('.homme-dragon-sheet__detail-trigger'))
        .find((el) => (el.nativeElement.textContent as string).includes('Grande épée'));
      expect(trigger).toBeFalsy();
      expect(fixture.nativeElement.textContent).toContain('Grande épée');
    });

    it("pouvoir d'éveil choisi avec description au catalogue → s'ouvre via DetailSurface (AC de la story)", async () => {
      const { fixture } = await createComponent(
        makeHommeDragonService(makeDto({ eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }] })),
      );
      const component = fixture.componentInstance;

      const section = fixture.debugElement.query(By.css('.homme-dragon-sheet__eveil-powers'));
      const trigger = section.query(By.css('.homme-dragon-sheet__detail-trigger'));
      expect(trigger).toBeTruthy();
      expect((trigger.nativeElement.textContent as string).trim()).toBe('Escorte du dragon');

      trigger.triggerEventHandler('click', new MouseEvent('click'));
      fixture.detectChanges();

      expect(component['detail'].selected()).toEqual({
        title: 'Escorte du dragon',
        body: "L'homme-dragon guide les voyageurs perdus.",
      });
    });

    it("pouvoir d'éveil choisi sans description au catalogue → pas de déclencheur, libellé affiché en texte simple", async () => {
      const { fixture } = await createComponent(
        makeHommeDragonService(makeDto({ eveilPowers: [{ level: 2, key: 'couche-du-dragon' }] })),
      );

      const section = fixture.debugElement.query(By.css('.homme-dragon-sheet__eveil-powers'));
      expect(section.query(By.css('.homme-dragon-sheet__detail-trigger'))).toBeFalsy();
      expect(section.nativeElement.textContent as string).toContain('Couche du dragon');
    });

    it('fermeture de la surface de détail via detail.close() vide le contenu sélectionné', async () => {
      const { fixture } = await createComponent(
        makeHommeDragonService(makeDto({ eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }] })),
      );
      const component = fixture.componentInstance;

      const trigger = fixture.debugElement.query(
        By.css('.homme-dragon-sheet__eveil-powers .homme-dragon-sheet__detail-trigger'),
      );
      trigger.triggerEventHandler('click', new MouseEvent('click'));
      fixture.detectChanges();
      expect(component['detail'].selected()).toBeTruthy();

      component['detail'].close();
      fixture.detectChanges();

      expect(component['detail'].selected()).toBeNull();
    });
  });

  describe('Souffles (Story 33.2)', () => {
    function dragon(race: HommeDragonDto['sheetData']['race'], level: number) {
      return makeHommeDragonService(
        makeDto({
          sheetData: { race, artefact: { key: 'grand-arc' }, nom: 'Ignis' },
          derived: { level, PS: level >= 3 ? 5 : 3 },
        }),
      );
    }

    function souffleSection(fixture: ComponentFixture<HommeDragonSheet>): DebugElement {
      return fixture.debugElement.query(By.css('.homme-dragon-sheet__souffles'));
    }

    /** Libellé d'un souffle listé : texte du déclencheur ou texte simple, sans le coût ni la
     *  mention « non réservable ». */
    function itemLabel(li: DebugElement): string {
      return Array.from((li.nativeElement as HTMLElement).childNodes)
        .filter(
          (n) =>
            n.nodeType === Node.TEXT_NODE ||
            (n as HTMLElement).classList?.contains('homme-dragon-sheet__detail-trigger'),
        )
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
    }

    function souffleLabels(root: DebugElement): string[] {
      return root.queryAll(By.css('li')).map(itemLabel);
    }

    function souffleItem(fixture: ComponentFixture<HommeDragonSheet>, label: string): DebugElement {
      const li = souffleSection(fixture)
        .queryAll(By.css('li'))
        .find((el) => itemLabel(el) === label);
      expect(li).toBeTruthy();
      return li!;
    }

    it('Dragon Vert niveau 2 → 9 communs groupés par famille + Nostalgie, Route, Voyage ; aucune autre race, pas de bloc « autres races » (matrice)', async () => {
      const { fixture } = await createComponent(dragon('DRAGON_VERT', 2));

      const section = souffleSection(fixture);
      expect(section).toBeTruthy();

      const familles = section.queryAll(By.css('[data-famille]'));
      expect(familles.map((g) => g.attributes['data-famille'])).toEqual(['temps', 'destin', 'pnj']);
      expect(souffleLabels(familles[0])).toEqual(['Passé', 'Futur']);
      expect(souffleLabels(familles[1])).toEqual(['Chance', 'Malchance']);
      expect(souffleLabels(familles[2])).toEqual([
        'Ennemi juré',
        'Nuée grouillante',
        'Guet-apens',
        'Retrouvailles',
        'Fuite',
      ]);
      expect(familles[0].nativeElement.textContent).toContain('Souffles manipulant le temps');
      expect(familles[1].nativeElement.textContent).toContain('Souffles manipulant le destin');
      expect(familles[1].nativeElement.textContent).toContain(
        'à utiliser juste avant ou après un jet de dés',
      );
      expect(familles[2].nativeElement.textContent).toContain('Souffles aidant les PNJ');
      expect(familles[2].query(By.css('.homme-dragon-sheet__souffle-consigne'))).toBeFalsy();

      const race = section.query(By.css('.homme-dragon-sheet__souffles-race'));
      expect(race.nativeElement.textContent).toContain('Souffles du Dragon Vert');
      expect(souffleLabels(race)).toEqual(['Nostalgie', 'Route', 'Voyage']);

      expect(souffleLabels(section)).toEqual([...COMMON_SOUFFLE_LABELS, 'Nostalgie', 'Route', 'Voyage']);
      expect(section.query(By.css('details'))).toBeFalsy();
      expect(section.nativeElement.textContent).not.toContain('Souffles des autres races');
    });

    it('Dragon Rouge niveau 3 → communs + Défi, Courage, Renaissance ; bloc replié avec les souffles vert, bleu et noir groupés par race (matrice)', async () => {
      const { fixture } = await createComponent(dragon('DRAGON_ROUGE', 3));

      const section = souffleSection(fixture);
      expect(souffleLabels(section.query(By.css('.homme-dragon-sheet__souffles-race')))).toEqual([
        'Défi',
        'Courage',
        'Renaissance',
      ]);
      const commons = section
        .queryAll(By.css('[data-famille]'))
        .flatMap((g) => souffleLabels(g));
      expect(commons).toEqual(COMMON_SOUFFLE_LABELS);

      const details = section.query(By.css('details.homme-dragon-sheet__souffles-autres-races'));
      expect(details).toBeTruthy();
      expect((details.nativeElement as HTMLDetailsElement).open).toBe(false);
      expect(details.query(By.css('summary')).nativeElement.textContent.trim()).toBe(
        'Souffles des autres races',
      );
      const groups = details.queryAll(By.css('[data-race]'));
      expect(groups.map((g) => g.attributes['data-race'])).toEqual([
        'DRAGON_VERT',
        'DRAGON_BLEU',
        'DRAGON_NOIR',
      ]);
      expect(souffleLabels(groups[0])).toEqual(['Nostalgie', 'Route', 'Voyage']);
      expect(souffleLabels(groups[1])).toEqual(['Amour', 'Bonté', 'Émotion']);
      expect(souffleLabels(groups[2])).toEqual(['Massacre', 'Obéissance', 'Vengeance']);
      expect(souffleLabels(details)).not.toContain('Défi');
    });

    it('souffles du temps (Passé, Futur) → « 2 PS » et mention « non réservable » (matrice)', async () => {
      const { fixture } = await createComponent(dragon('DRAGON_ROUGE', 1));

      for (const label of ['Passé', 'Futur']) {
        const li = souffleItem(fixture, label);
        expect(li.query(By.css('.stat-pill')).nativeElement.textContent.trim()).toBe('2 PS');
        expect(li.query(By.css('.homme-dragon-sheet__souffle-note')).nativeElement.textContent.trim()).toBe(
          'non réservable',
        );
      }
    });

    it('autre souffle (Chance) → « 1 PS », sans mention « non réservable » (matrice)', async () => {
      const { fixture } = await createComponent(dragon('DRAGON_ROUGE', 1));

      const li = souffleItem(fixture, 'Chance');
      expect(li.query(By.css('.stat-pill')).nativeElement.textContent.trim()).toBe('1 PS');
      expect(li.query(By.css('.homme-dragon-sheet__souffle-note'))).toBeFalsy();
      expect(li.nativeElement.textContent).not.toContain('non réservable');
    });

    it('race sans souffle au catalogue → communs seuls, aucune erreur (matrice)', async () => {
      const catalog: GameSystemContentDto = {
        ...CATALOG,
        souffle: CATALOG['souffle'].filter(
          (e) => (e.data as { race?: string }).race !== 'DRAGON_BLEU',
        ),
      };
      const { fixture } = await createComponent(
        dragon('DRAGON_BLEU', 1),
        makeCharacterService(catalog),
      );
      const component = fixture.componentInstance;

      const section = souffleSection(fixture);
      expect(component['loadError']()).toBeNull();
      expect(section.query(By.css('.homme-dragon-sheet__souffles-race'))).toBeFalsy();
      expect(souffleLabels(section)).toEqual(COMMON_SOUFFLE_LABELS);
    });

    it('souffle sans description → libellé en texte simple, pas de déclencheur (matrice)', async () => {
      const catalog: GameSystemContentDto = {
        ...CATALOG,
        souffle: CATALOG['souffle'].map((e) =>
          e.key === 'defi' ? souffle('defi', 'Défi', { race: 'DRAGON_ROUGE' }) : e,
        ),
      };
      const { fixture } = await createComponent(
        dragon('DRAGON_ROUGE', 1),
        makeCharacterService(catalog),
      );

      const li = souffleItem(fixture, 'Défi');
      expect(li).toBeTruthy();
      expect(li.query(By.css('.homme-dragon-sheet__detail-trigger'))).toBeFalsy();
      expect(li.query(By.css('.stat-pill')).nativeElement.textContent.trim()).toBe('1 PS');
    });

    it('souffle sans libellé au catalogue → repli sur la clé brute', async () => {
      const catalog: GameSystemContentDto = {
        ...CATALOG,
        souffle: [{ key: 'chance', data: { key: 'chance', famille: 'destin', ps: 1 } }],
      };
      const { fixture } = await createComponent(
        dragon('DRAGON_ROUGE', 1),
        makeCharacterService(catalog),
      );

      expect(souffleLabels(souffleSection(fixture))).toEqual(['chance']);
    });

    it('souffle affiché → sa description s’ouvre dans la surface de détail, sans quitter la fiche (AC3)', async () => {
      const { fixture } = await createComponent(dragon('DRAGON_ROUGE', 1));
      const component = fixture.componentInstance;

      const trigger = souffleItem(fixture, 'Chance').query(
        By.css('.homme-dragon-sheet__detail-trigger'),
      );
      expect(trigger).toBeTruthy();

      trigger.triggerEventHandler('click', new MouseEvent('click'));
      fixture.detectChanges();

      expect(component['detail'].selected()).toEqual({
        title: 'Chance',
        body: 'Réussite critique automatique.',
      });
      expect(souffleSection(fixture)).toBeTruthy();
    });

    it("les pouvoirs d'éveil ne sont jamais listés parmi les souffles", async () => {
      const { fixture } = await createComponent(dragon('DRAGON_ROUGE', 3));

      const text = souffleSection(fixture).nativeElement.textContent as string;
      expect(text).not.toContain('Escorte du dragon');
      expect(text).not.toContain('Couche du dragon');
    });

    it("le mécanisme de choix de pouvoir d'éveil au level-up reste inchangé : aucun souffle n'y devient sélectionnable (AC4)", async () => {
      const { fixture } = await createComponent(
        makeHommeDragonService(makeDto({ pendingEveilLevels: [2] })),
      );
      const component = fixture.componentInstance;

      const keys = component['eveilPowersForCurrentLevel']().map((e) => e.key);
      expect(keys).toEqual(['escorte-du-dragon', 'couche-du-dragon']);
      expect(keys).not.toContain('chance');
      expect(keys).not.toContain('defi');
      const options = fixture.debugElement
        .query(By.css('.homme-dragon-sheet__eveil-prompt'))
        .queryAll(By.css('option'))
        .map((o) => (o.nativeElement.textContent as string).trim());
      expect(options).not.toContain('Chance');
      expect(options).not.toContain('Défi');
    });
  });

  describe('Câblage temps réel (Story 20.2)', () => {
    it('une notification HommeDragonService.changed() recharge la fiche affichée (AC1)', async () => {
      const initial = makeDto();
      const hommeDragonSvc = makeHommeDragonService(initial);
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;
      const updated = makeDto({ pendingEveilLevels: [3] });
      hommeDragonSvc.findOne.mockResolvedValue(updated);

      hommeDragonSvc.changed.update((v) => v + 1);
      fixture.detectChanges();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      expect(component['hommeDragon']()).toEqual(updated);
    });

    it('un findOne() rejeté pendant refreshHommeDragon() est absorbé sans planter, la fiche reste affichée telle quelle', async () => {
      const initial = makeDto();
      const hommeDragonSvc = makeHommeDragonService(initial);
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;
      hommeDragonSvc.findOne.mockRejectedValue(new Error('network'));

      hommeDragonSvc.changed.update((v) => v + 1);
      fixture.detectChanges();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      // non-bloquant : la fiche affichée reste celle du chargement initial, aucune exception,
      // pas de loadError() déclenché (réservé au fetch initial de ngOnInit(), pas au rafraîchissement).
      expect(component['hommeDragon']()).toEqual(initial);
      expect(component['loadError']()).toBeNull();
    });

    it('garde firstRun : un changed() déjà non-nul au montage ne déclenche PAS de refetch redondant', async () => {
      // HommeDragonService est providedIn:'root' — son signal _changed peut déjà porter une valeur
      // non-nulle AVANT le montage (mutation locale antérieure dans la même session). Sans le garde
      // firstRun, ce cas déclencherait un refetch en plus de celui déjà fait par ngOnInit().
      // HommeDragonSheet ne rend aucun enfant réagissant lui aussi à HommeDragonService.changed —
      // un compte exact de 1 est donc fiable ici.
      const hommeDragonSvc = makeHommeDragonService(makeDto(), { changed: signal(1) });
      await createComponent(hommeDragonSvc);

      expect(hommeDragonSvc.findOne.mock.calls.length).toBe(1);
    });

    it('un changed() survenant avant la résolution du fetch initial ne plante pas (garde if (hommeDragon() === undefined) return)', async () => {
      let resolveFindOne!: (hd: HommeDragonDto | null) => void;
      const hommeDragonSvc = makeHommeDragonService();
      hommeDragonSvc.findOne.mockReturnValue(
        new Promise<HommeDragonDto | null>((resolve) => (resolveFindOne = resolve)),
      );
      const characterSvc = makeCharacterService();

      await TestBed.configureTestingModule({
        imports: [HommeDragonSheet],
        providers: [
          { provide: HommeDragonService, useValue: hommeDragonSvc },
          { provide: CharacterService, useValue: characterSvc },
          { provide: ThemeToneService, useValue: makeThemeService() },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(HommeDragonSheet);
      fixture.componentRef.setInput('partieId', 'p1');
      fixture.componentRef.setInput('partieName', 'Ma Campagne');
      fixture.detectChanges();
      // firstRun est consommé au premier flush de l'effect() — le fetch initial (findOne()) est
      // toujours en attente (resolveFindOne non appelé) à ce stade.
      await Promise.resolve();
      fixture.detectChanges();

      // Un événement temps réel survient PENDANT que this.hommeDragon() est encore undefined —
      // refreshHommeDragon() doit no-op silencieusement (garde if (hommeDragon() === undefined)
      // return), pas planter.
      expect(() => hommeDragonSvc.changed.update((v) => v + 1)).not.toThrow();
      fixture.detectChanges();
      await Promise.resolve();
      fixture.detectChanges();

      const dto = makeDto();
      resolveFindOne(dto);
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      expect(fixture.componentInstance['hommeDragon']()).toEqual(dto);
    });
  });
});
