import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { BreakpointObserver } from '@angular/cdk/layout';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { GameSystemContentDto, HommeDragonDto } from '@master-jdr/shared';
import { HommeDragonSheet } from './homme-dragon-sheet';
import { HommeDragonCreationWizard } from '../homme-dragon-creation-wizard/homme-dragon-creation-wizard';
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
    { key: 'anneau', data: { key: 'anneau', label: 'Anneau', race: 'DRAGON_BLEU' } },
    { key: 'cristal', data: { key: 'cristal', label: 'Cristal', race: 'DRAGON_BLEU' } },
    { key: 'mascotte', data: { key: 'mascotte', label: 'Mascotte', race: 'DRAGON_BLEU' } },
    { key: 'coupe', data: { key: 'coupe', label: 'Coupe', race: 'DRAGON_NOIR' } },
    { key: 'dague', data: { key: 'dague', label: 'Dague', race: 'DRAGON_NOIR' } },
    {
      key: 'miroir',
      data: {
        key: 'miroir',
        label: 'Miroir',
        race: 'DRAGON_NOIR',
        description: 'Renvoie aux voyageurs leurs pires peurs.',
      },
    },
  ],
  // Story 33.7 — mêmes clés/niveaux que `homme-dragon-level-capacities.json`, textes abrégés.
  hommeDragonLevelCapacity: [
    { key: 'reserve', data: { key: 'reserve', label: 'Réserve de souffles', level: 2, description: 'Une réserve dès le niveau 2.' } },
    { key: 'augmentation-du-souffle', data: { key: 'augmentation-du-souffle', label: 'Augmentation du souffle', level: 3, description: 'PS portés à 5.' } },
    { key: 'souffles-multicolores', data: { key: 'souffles-multicolores', label: 'Souffles multicolores', level: 3, description: "Souffles d'une autre race." } },
    { key: 'artefact-cadeau', data: { key: 'artefact-cadeau', label: 'Artefact cadeau', level: 4, description: 'Un artefact offert.' } },
    { key: 'invitation-au-voyage', data: { key: 'invitation-au-voyage', label: 'Invitation au voyage', level: 4, description: 'Une nouvelle forme.' } },
    { key: 'envol-du-dragon-des-saisons', data: { key: 'envol-du-dragon-des-saisons', label: 'Envol du dragon des saisons', level: 5, description: 'Mère-dragon.' } },
  ],
  // Story 33.7 — sans race, famille ni reservable, `ps: 1` (cf. `souffles-rituels.json`).
  souffleRituel: [
    { key: 'rituel-du-sommeil', data: { key: 'rituel-du-sommeil', label: 'Rituel du sommeil', ps: 1, description: 'Un joueur endormi paie.' } },
    { key: 'rituel-du-tabou', data: { key: 'rituel-du-tabou', label: 'Rituel du tabou', ps: 1, description: 'Mots modernes interdits.' } },
    { key: 'rituel-de-l-esprit-des-mots', data: { key: 'rituel-de-l-esprit-des-mots', label: "Rituel de l'esprit des mots", ps: 1, description: 'Une phrase se réalise.' } },
    { key: 'rituel-de-la-guigne', data: { key: 'rituel-de-la-guigne', label: 'Rituel de la guigne', ps: 1, description: 'Peau de banane.' } },
    { key: 'rituel-de-l-improvisation', data: { key: 'rituel-de-l-improvisation', label: "Rituel de l'improvisation", ps: 1, description: 'Scénario improvisé.' } },
    { key: 'fete-des-poings', data: { key: 'fete-des-poings', label: 'Fête des poings', ps: 1, description: 'Pierre-papier-ciseaux.' } },
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
    chooseArtefactCadeau: vi.fn(),
    setReserveSlot: vi.fn(),
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

  it('aucun Homme Dragon existant → parcours de création affiché, titre de la Partie transmis (AC1)', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;

    expect(component['hommeDragon']()).toBeNull();
    const wizard = fixture.debugElement.query(By.directive(HommeDragonCreationWizard));
    expect(wizard).toBeTruthy();
    expect(wizard.componentInstance.partieId()).toBe('p1');
    expect(wizard.componentInstance.partieName()).toBe('Ma Campagne');
  });

  it('fiche créée par le parcours → fiche affichée avec le bandeau « fiche créée » (Story 33.3)', async () => {
    const { fixture } = await createComponent();
    const component = fixture.componentInstance;
    const wizard = fixture.debugElement.query(By.directive(HommeDragonCreationWizard));

    wizard.componentInstance.created.emit(makeDto());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['hommeDragon']()).toEqual(makeDto());
    expect(component['justCreated']()).toBe(true);
    expect(fixture.debugElement.query(By.directive(HommeDragonCreationWizard))).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('Votre Homme Dragon a pris vie.');
  });

  it('Homme Dragon déjà existant → fiche affichée directement, pas de formulaire de création', async () => {
    const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
    const component = fixture.componentInstance;

    expect(component['hommeDragon']()).toEqual(makeDto());
    expect(fixture.debugElement.query(By.directive(HommeDragonCreationWizard))).toBeFalsy();
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
      chooseArtefactCadeau: vi.fn(),
      setReserveSlot: vi.fn(),
      exportPdf: vi.fn(),
      changed: signal(0),
    };
    const { fixture } = await createComponent(hommeDragonSvc);
    const component = fixture.componentInstance;

    expect(component['loadError']()).toBeTruthy();
    expect(component['hommeDragon']()).toBeUndefined();
    expect(fixture.debugElement.query(By.directive(HommeDragonCreationWizard))).toBeFalsy();
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

  describe('Export PDF (menu à deux formats, Story 33.4)', () => {
    it.each(['editable', '2pages'] as const)(
      'onExportPdf("%s") appelle exportPdf() avec le partieId et le format, sans erreur',
      async (format) => {
        const hommeDragonSvc = makeHommeDragonService(makeDto());
        hommeDragonSvc.exportPdf.mockResolvedValue(
          new Blob(['%PDF-1.6'], { type: 'application/pdf' }),
        );
        const { fixture } = await createComponent(hommeDragonSvc);
        const component = fixture.componentInstance;

        await component['onExportPdf'](format);

        expect(hommeDragonSvc.exportPdf).toHaveBeenCalledWith('p1', format);
        expect(component['exportError']()).toBeNull();
        expect(component['exporting']()).toBe(false);
      },
    );

    it('nom de fichier téléchargé distinct par format', async () => {
      const hommeDragonSvc = makeHommeDragonService(makeDto());
      hommeDragonSvc.exportPdf.mockResolvedValue(new Blob(['%PDF-1.6']));
      const names: string[] = [];
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        names.push(this.download);
      });
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;

      await component['onExportPdf']('editable');
      await component['onExportPdf']('2pages');
      clickSpy.mockRestore();

      expect(names).toEqual(['homme-dragon-Ignis-editable.pdf', 'homme-dragon-Ignis-2pages.pdf']);
    });

    it('échec de exportPdf() → exportError() renseigné, formulaire non cassé', async () => {
      const hommeDragonSvc = makeHommeDragonService(makeDto());
      hommeDragonSvc.exportPdf.mockRejectedValue(new Error('network down'));
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;

      await component['onExportPdf']('editable');

      expect(component['exportError']()).toBeTruthy();
      expect(component['exporting']()).toBe(false);
    });

    it('le déclencheur ouvre un menu à deux entrées (éditable / 2 pages), accessible', async () => {
      const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
      const el = fixture.nativeElement as HTMLElement;
      const trigger = el.querySelector<HTMLButtonElement>('.homme-dragon-sheet__export-trigger')!;

      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(el.querySelector('[role="menu"]')).toBeNull();

      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const menu = el.querySelector('[role="menu"]')!;
      expect(menu.getAttribute('aria-label')).toBeTruthy();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((i) =>
        i.textContent?.trim(),
      );
      expect(items).toEqual(['PDF éditable', 'PDF 2 pages (à imprimer)']);
    });

    it('choisir « 2 pages » dans le menu exporte en 2pages et referme le menu', async () => {
      const hommeDragonSvc = makeHommeDragonService(makeDto());
      hommeDragonSvc.exportPdf.mockResolvedValue(new Blob(['%PDF-1.6']));
      const { fixture } = await createComponent(hommeDragonSvc);
      const el = fixture.nativeElement as HTMLElement;

      el.querySelector<HTMLButtonElement>('.homme-dragon-sheet__export-trigger')!.click();
      fixture.detectChanges();
      const items = el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      items[1].click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(hommeDragonSvc.exportPdf).toHaveBeenCalledWith('p1', '2pages');
      expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    it('Échap referme le menu ; les flèches bouclent sur les entrées', async () => {
      const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
      const el = fixture.nativeElement as HTMLElement;
      el.querySelector<HTMLButtonElement>('.homme-dragon-sheet__export-trigger')!.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
      const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      items[0].focus();
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[1]);
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[0]);
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(items[1]);

      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    async function openMenu(fixture: ComponentFixture<HommeDragonSheet>) {
      const el = fixture.nativeElement as HTMLElement;
      const trigger = el.querySelector<HTMLButtonElement>('.homme-dragon-sheet__export-trigger')!;
      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();
      const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
      const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      return { el, trigger, menu, items };
    }

    const press = (menu: HTMLElement, key: string) =>
      menu.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

    it('le focus arrive sur la première entrée à l’ouverture, puis revient au déclencheur après Échap', async () => {
      const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
      const { trigger, menu, items } = await openMenu(fixture);
      expect(document.activeElement).toBe(items[0]);

      press(menu, 'Escape');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(document.activeElement).toBe(trigger);
    });

    it('après un export terminé, le focus est restitué au déclencheur (réactivé)', async () => {
      const hommeDragonSvc = makeHommeDragonService(makeDto());
      hommeDragonSvc.exportPdf.mockResolvedValue(new Blob(['%PDF-1.6']));
      const { fixture } = await createComponent(hommeDragonSvc);
      const { trigger, items } = await openMenu(fixture);

      items[0].click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.componentInstance['exporting']()).toBe(false);
      expect(trigger.disabled).toBe(false);
      expect(document.activeElement).toBe(trigger);
    });

    it('un clic sur le fond du menu le referme', async () => {
      const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
      const { el } = await openMenu(fixture);

      el.querySelector<HTMLElement>('.homme-dragon-sheet__export-backdrop')!.click();
      fixture.detectChanges();

      expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    it('Début / Fin atteignent la première / dernière entrée', async () => {
      const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
      const { menu, items } = await openMenu(fixture);

      press(menu, 'End');
      expect(document.activeElement).toBe(items[items.length - 1]);
      press(menu, 'Home');
      expect(document.activeElement).toBe(items[0]);
    });

    it('Tab referme le menu et le focus passe au déclencheur (Tab continue depuis lui)', async () => {
      const { fixture } = await createComponent(makeHommeDragonService(makeDto()));
      const { el, trigger, menu } = await openMenu(fixture);
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

      menu.dispatchEvent(event);
      // Synchrone : avant que l'item focalisé ne quitte le DOM.
      expect(document.activeElement).toBe(trigger);
      fixture.detectChanges();

      expect(el.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(event.defaultPrevented).toBe(false);
    });
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

  describe('Capacités de niveau (Story 33.7)', () => {
    function dragon(
      level: number,
      sheetExtra: Partial<HommeDragonDto['sheetData']> = {},
      race: HommeDragonDto['sheetData']['race'] = 'DRAGON_ROUGE',
    ) {
      return makeHommeDragonService(
        makeDto({
          sheetData: { race, artefact: { key: 'grand-arc' }, nom: 'Ignis', ...sheetExtra },
          derived: { level, PS: level >= 5 ? 10 : level >= 3 ? 5 : 3 },
        }),
      );
    }

    const q = (fixture: ComponentFixture<HommeDragonSheet>, css: string) =>
      fixture.debugElement.query(By.css(css));
    const qa = (fixture: ComponentFixture<HommeDragonSheet>, css: string) =>
      fixture.debugElement.queryAll(By.css(css));
    const text = (fixture: ComponentFixture<HommeDragonSheet>) =>
      fixture.nativeElement.textContent as string;

    async function settle(fixture: ComponentFixture<HommeDragonSheet>) {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }
    }

    it('niveau 1 → ni carte « Capacités », ni choix de cadeau, ni rituels (matrice)', async () => {
      const { fixture } = await createComponent(dragon(1));

      expect(q(fixture, '.homme-dragon-sheet__capacities')).toBeNull();
      expect(q(fixture, '.homme-dragon-sheet__cadeau-prompt')).toBeNull();
      expect(q(fixture, '.homme-dragon-sheet__rituals')).toBeNull();
    });

    it('niveau 3 → les 3 capacités des niveaux 2-3 listées avec leur description, aucun choix de cadeau (matrice)', async () => {
      const { fixture } = await createComponent(dragon(3));

      const items = qa(fixture, '.homme-dragon-sheet__capacity');
      expect(items.map((li) => li.query(By.css('.homme-dragon-sheet__capacity-name')).nativeElement.textContent.trim())).toEqual([
        'Réserve de souffles',
        'Augmentation du souffle',
        'Souffles multicolores',
      ]);
      expect(items[0].nativeElement.textContent).toContain('Une réserve dès le niveau 2.');
      expect(items[2].nativeElement.textContent).toContain("Souffles d'une autre race.");
      expect(items[1].query(By.css('.stat-pill')).nativeElement.textContent.trim()).toBe('Niveau 3');
      expect(q(fixture, '.homme-dragon-sheet__cadeau-prompt')).toBeNull();
    });

    it('niveau 4, rien choisi (dragon rouge) → choix limité aux artefacts vert/bleu/noir, avec libellé de race', async () => {
      const { fixture } = await createComponent(dragon(4));

      const prompt = q(fixture, '.homme-dragon-sheet__cadeau-prompt');
      expect(prompt).toBeTruthy();
      const cards = prompt.queryAll(By.css('app-choice-card button.choice-card'));
      const labels = cards.map((c) => (c.nativeElement.querySelector('.choice-card__label') as HTMLElement).textContent!.trim());
      expect(labels.sort()).toEqual(
        ['Anneau', 'Coupe', 'Cristal', 'Dague', 'Encyclopédie', 'Lanterne', 'Mascotte', 'Miroir', 'Sextant'].sort(),
      );
      expect(labels).not.toContain('Grand arc');
      const badges = cards.map((c) => (c.nativeElement.querySelector('.choice-card__badge') as HTMLElement).textContent!.trim());
      expect(new Set(badges)).toEqual(new Set(['Vert', 'Bleu', 'Noir']));
    });

    it('choix puis confirmation explicite « Ce choix est définitif » avant tout envoi, puis cadeau affiché sans sélecteur', async () => {
      const hommeDragonSvc = dragon(4);
      hommeDragonSvc.chooseArtefactCadeau.mockResolvedValue(
        makeDto({
          sheetData: {
            race: 'DRAGON_ROUGE',
            artefact: { key: 'grand-arc' },
            nom: 'Ignis',
            artefactCadeau: { key: 'lanterne' },
          },
          derived: { level: 4, PS: 5 },
        }),
      );
      const { fixture } = await createComponent(hommeDragonSvc);

      const card = qa(fixture, '.homme-dragon-sheet__cadeau-prompt button.choice-card').find((c) =>
        (c.nativeElement as HTMLElement).textContent!.includes('Lanterne'),
      )!;
      card.nativeElement.click();
      fixture.detectChanges();
      (q(fixture, '.homme-dragon-sheet__cadeau-next').nativeElement as HTMLButtonElement).click();
      fixture.detectChanges();

      // Confirmation demandée, rien n'est encore envoyé.
      expect(text(fixture)).toContain('Ce choix est définitif');
      expect(text(fixture)).toContain('Lanterne');
      expect(hommeDragonSvc.chooseArtefactCadeau).not.toHaveBeenCalled();

      const confirm = qa(fixture, '.homme-dragon-sheet__cadeau-confirm button').find((b) =>
        (b.nativeElement as HTMLElement).textContent!.includes('Confirmer'),
      )!;
      confirm.nativeElement.click();
      await settle(fixture);

      expect(hommeDragonSvc.chooseArtefactCadeau).toHaveBeenCalledWith('p1', { key: 'lanterne' });
      expect(q(fixture, '.homme-dragon-sheet__cadeau-prompt')).toBeNull();
      const shown = q(fixture, '.homme-dragon-sheet__cadeau').nativeElement as HTMLElement;
      expect(shown.textContent).toContain('Artefact cadeau');
      expect(shown.textContent).toContain('Lanterne');
      expect(shown.textContent).toContain('Dragon Vert');
    });

    it('« Revenir au choix » annule la confirmation sans rien envoyer', async () => {
      const hommeDragonSvc = dragon(4);
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;

      component['selectCadeau']('miroir');
      component['askCadeauConfirmation']();
      fixture.detectChanges();
      expect(q(fixture, '.homme-dragon-sheet__cadeau-confirm')).toBeTruthy();

      const back = qa(fixture, '.homme-dragon-sheet__cadeau-confirm button').find((b) =>
        (b.nativeElement as HTMLElement).textContent!.includes('Revenir'),
      )!;
      back.nativeElement.click();
      fixture.detectChanges();

      expect(hommeDragonSvc.chooseArtefactCadeau).not.toHaveBeenCalled();
      expect(q(fixture, '.homme-dragon-sheet__cadeau-confirm')).toBeNull();
      expect(q(fixture, '.homme-dragon-sheet__cadeau-grid')).toBeTruthy();
    });

    it("focus : la confirmation reçoit le focus, « Revenir au choix » le rend à « Choisir cet artefact » ; l'erreur est annoncée (role=alert)", async () => {
      const hommeDragonSvc = dragon(4);
      hommeDragonSvc.chooseArtefactCadeau.mockRejectedValue(new Error('400'));
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;
      const confirmBlock = () =>
        q(fixture, '.homme-dragon-sheet__cadeau-confirm')?.nativeElement as HTMLElement | undefined;

      component['selectCadeau']('miroir');
      component['askCadeauConfirmation']();
      fixture.detectChanges();
      await settle(fixture);
      expect(document.activeElement).toBe(confirmBlock());

      const back = qa(fixture, '.homme-dragon-sheet__cadeau-confirm button').find((b) =>
        (b.nativeElement as HTMLElement).textContent!.includes('Revenir'),
      )!;
      back.nativeElement.click();
      fixture.detectChanges();
      await settle(fixture);
      expect(document.activeElement).toBe(q(fixture, '.homme-dragon-sheet__cadeau-next').nativeElement);

      component['askCadeauConfirmation']();
      await component['onConfirmCadeau']();
      fixture.detectChanges();
      expect(q(fixture, '.homme-dragon-sheet__cadeau-prompt .error').attributes['role']).toBe('alert');
    });

    it("sans sélection, « Choisir cet artefact » est inactif ; confirmer sans passer par l'étape de confirmation n'envoie rien", async () => {
      const hommeDragonSvc = dragon(4);
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;

      expect((q(fixture, '.homme-dragon-sheet__cadeau-next').nativeElement as HTMLButtonElement).disabled).toBe(true);
      component['selectCadeau']('miroir');
      await component['onConfirmCadeau']();

      expect(hommeDragonSvc.chooseArtefactCadeau).not.toHaveBeenCalled();
    });

    it("échec de l'enregistrement → message d'erreur, retour à la sélection", async () => {
      const hommeDragonSvc = dragon(4);
      hommeDragonSvc.chooseArtefactCadeau.mockRejectedValue(new Error('400'));
      const { fixture } = await createComponent(hommeDragonSvc);
      const component = fixture.componentInstance;

      component['selectCadeau']('miroir');
      component['askCadeauConfirmation']();
      await component['onConfirmCadeau']();
      fixture.detectChanges();

      expect(text(fixture)).toContain("Impossible d'enregistrer ce choix");
      expect(component['confirmingCadeau']()).toBe(false);
      expect(component['hommeDragon']()?.sheetData.artefactCadeau).toBeUndefined();
    });

    it('niveau 4, cadeau choisi → affiché sous l\'artefact principal, plus de sélecteur (matrice)', async () => {
      const { fixture } = await createComponent(dragon(4, { artefactCadeau: { key: 'miroir' } }));

      expect(q(fixture, '.homme-dragon-sheet__cadeau-prompt')).toBeNull();
      expect(qa(fixture, 'app-choice-card')).toHaveLength(0);
      const artefactCard = qa(fixture, '.homme-dragon-sheet__card')[0].nativeElement as HTMLElement;
      expect(artefactCard.textContent).toContain('Grand arc');
      expect(artefactCard.textContent).toContain('Artefact cadeau');
      expect(artefactCard.textContent).toContain('Miroir');
      expect(artefactCard.textContent).toContain('Dragon Noir');
      // Définitif : aucun second bouton « Modifier » pour le cadeau.
      expect(artefactCard.querySelectorAll('button:not(.homme-dragon-sheet__detail-trigger)')).toHaveLength(1);
    });

    it('entrée retirée du catalogue → libellé = clé brute (matrice)', async () => {
      const { fixture } = await createComponent(
        dragon(4, { artefactCadeau: { key: 'artefact-retire' } }),
      );

      const shown = q(fixture, '.homme-dragon-sheet__cadeau').nativeElement as HTMLElement;
      expect(shown.textContent).toContain('artefact-retire');
    });

    it('niveau 5 → 6 rituels consultables à « 1 PS », consigne de réserve réécrite (placés dans la réserve, sans décompte), jamais « autre race » (matrice)', async () => {
      const { fixture } = await createComponent(dragon(5));

      const section = q(fixture, '.homme-dragon-sheet__rituals');
      expect(section).toBeTruthy();
      const items = section.queryAll(By.css('li'));
      expect(items).toHaveLength(6);
      for (const li of items) {
        expect(li.query(By.css('.stat-pill')).nativeElement.textContent.trim()).toBe('1 PS');
        expect(li.query(By.css('.homme-dragon-sheet__souffle-note'))).toBeNull();
      }
      expect(section.nativeElement.textContent).toContain('Rituel du sommeil');
      expect(section.nativeElement.textContent).toContain('Fête des poings');
      // Story 33.6 : la consigne de lecture seule (« sans réserve ni décompte ») est réécrite.
      expect(section.nativeElement.textContent).toContain(
        'peuvent être placés dans la réserve, sans décompte',
      );
      expect(section.nativeElement.textContent).not.toContain('sans réserve ni décompte');
      // Jamais classés parmi les souffles des autres races.
      expect(q(fixture, '.homme-dragon-sheet__souffles-autres-races').nativeElement.textContent).not.toContain('Rituel');
    });

    it('rituels : description consultable via la surface de détail', async () => {
      const { fixture } = await createComponent(dragon(5));

      const trigger = qa(fixture, '.homme-dragon-sheet__rituals .homme-dragon-sheet__detail-trigger')[1];
      (trigger.nativeElement as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Mots modernes interdits.');
    });

    it('rituels absents aux niveaux 1 à 4 (matrice)', async () => {
      for (const level of [1, 4]) {
        TestBed.resetTestingModule();
        const { fixture } = await createComponent(dragon(level));
        expect(q(fixture, '.homme-dragon-sheet__rituals')).toBeNull();
      }
    });

    it('catalogues de capacités/rituels absents → cartes masquées, fiche intacte', async () => {
      const { fixture } = await createComponent(
        dragon(5),
        makeCharacterService({ hommeDragonArtefact: CATALOG['hommeDragonArtefact'] }),
      );

      expect(q(fixture, '.homme-dragon-sheet__capacities')).toBeNull();
      expect(q(fixture, '.homme-dragon-sheet__rituals')).toBeNull();
      expect(text(fixture)).toContain('Ignis');
    });

    it('cadeau choisi depuis un autre appareil → fiche rafraîchie par le signal changed (matrice)', async () => {
      const hommeDragonSvc = dragon(4);
      const { fixture } = await createComponent(hommeDragonSvc);
      expect(q(fixture, '.homme-dragon-sheet__cadeau-prompt')).toBeTruthy();
      hommeDragonSvc.findOne.mockResolvedValue(
        makeDto({
          sheetData: {
            race: 'DRAGON_ROUGE',
            artefact: { key: 'grand-arc' },
            nom: 'Ignis',
            artefactCadeau: { key: 'lanterne' },
          },
          derived: { level: 4, PS: 5 },
        }),
      );

      hommeDragonSvc.changed.update((v) => v + 1);
      fixture.detectChanges();
      await settle(fixture);

      expect(q(fixture, '.homme-dragon-sheet__cadeau-prompt')).toBeNull();
      expect((q(fixture, '.homme-dragon-sheet__cadeau').nativeElement as HTMLElement).textContent).toContain('Lanterne');
    });
  });

  describe('Réserve de souffles (Story 33.6)', () => {
    function dragon(level: number, reserve?: (string | null)[]) {
      return makeHommeDragonService(
        makeDto({
          sheetData: {
            race: 'DRAGON_ROUGE',
            artefact: { key: 'grand-arc' },
            nom: 'Ignis',
            ...(reserve ? { reserve } : {}),
          },
          derived: { level, PS: level >= 5 ? 10 : level >= 3 ? 5 : 3 },
        }),
      );
    }

    const q = (fixture: ComponentFixture<HommeDragonSheet>, css: string) =>
      fixture.debugElement.query(By.css(css));
    const text = (fixture: ComponentFixture<HommeDragonSheet>) =>
      fixture.nativeElement.textContent as string;

    it("niveau 1 → la section n'affiche que la ligne d'information, aucun emplacement", async () => {
      const { fixture } = await createComponent(dragon(1));

      const section = q(fixture, 'app-reserve-section');
      expect(section).toBeTruthy();
      expect(section.nativeElement.textContent).toContain(
        "La réserve de souffles s'ouvre au niveau 2.",
      );
      expect(section.queryAll(By.css('button'))).toHaveLength(0);
    });

    it('niveau 4 → N − 1 emplacements, section juste AVANT la carte « Souffles » dans la colonne gauche', async () => {
      const { fixture } = await createComponent(dragon(4, ['courage', null, null]));

      const section = q(fixture, 'app-reserve-section').nativeElement as HTMLElement;
      expect(section.textContent).toContain('Niveau 4 · 3 emplacements');
      expect(section.querySelectorAll('.reserve__slot')).toHaveLength(3);
      const souffles = q(fixture, '.homme-dragon-sheet__souffles').nativeElement as HTMLElement;
      expect(section.parentElement).toBe(souffles.parentElement);
      expect(section.nextElementSibling).toBe(souffles);
      expect(text(fixture)).toContain('Courage');
    });

    it('un geste enregistré met la fiche à jour (réponse du serveur appliquée)', async () => {
      const hommeDragonSvc = dragon(3, [null, null]);
      const updated = makeDto({
        sheetData: {
          race: 'DRAGON_ROUGE',
          artefact: { key: 'grand-arc' },
          nom: 'Ignis',
          reserve: ['chance', null],
        },
        derived: { level: 3, PS: 5 },
        updatedAt: '2026-10-02T10:00:00.000Z',
      });
      hommeDragonSvc.setReserveSlot.mockResolvedValue(updated);
      const { fixture } = await createComponent(hommeDragonSvc);

      const pick = q(fixture, '[data-reserve-btn="pick"][data-slot="1"]')
        .nativeElement as HTMLElement;
      pick.click();
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }
      (q(fixture, '[aria-labelledby*="-chance-n"]').nativeElement as HTMLElement).click();
      fixture.detectChanges();
      (q(fixture, '.rp__btn--primary').nativeElement as HTMLElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(hommeDragonSvc.setReserveSlot).toHaveBeenCalledWith('p1', 1, { key: 'chance' });
      expect(fixture.componentInstance['hommeDragon']()).toEqual(updated);
    });

    it('une relecture de la fiche (signal changed) partie AVANT une écriture ne la remplace pas par une fiche plus ancienne', async () => {
      const newer = makeDto({ updatedAt: '2026-10-02T10:00:00.000Z' });
      const hommeDragonSvc = makeHommeDragonService(newer);
      const { fixture } = await createComponent(hommeDragonSvc);
      // La lecture déclenchée par `changed` renvoie une fiche plus ancienne que celle déjà affichée.
      hommeDragonSvc.findOne.mockResolvedValue(makeDto({ updatedAt: '2026-10-01T10:00:00.000Z' }));

      hommeDragonSvc.changed.update((v) => v + 1);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      expect(fixture.componentInstance['hommeDragon']()?.updatedAt).toBe(
        '2026-10-02T10:00:00.000Z',
      );
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
