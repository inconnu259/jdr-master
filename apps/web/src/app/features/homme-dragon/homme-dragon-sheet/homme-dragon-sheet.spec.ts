import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import type { GameSystemContentDto, HommeDragonDto } from '@master-jdr/shared';
import { HommeDragonSheet } from './homme-dragon-sheet';
import { HommeDragonService } from '../../../core/homme-dragon/homme-dragon.service';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const CATALOG: GameSystemContentDto = {
  hommeDragonArtefact: [
    { key: 'encyclopedie', data: { key: 'encyclopedie', label: 'Encyclopédie', race: 'DRAGON_VERT' } },
    { key: 'lanterne', data: { key: 'lanterne', label: 'Lanterne', race: 'DRAGON_VERT' } },
    { key: 'sextant', data: { key: 'sextant', label: 'Sextant', race: 'DRAGON_VERT' } },
    { key: 'grand-arc', data: { key: 'grand-arc', label: 'Grand arc', race: 'DRAGON_ROUGE' } },
    { key: 'grande-epee', data: { key: 'grande-epee', label: 'Grande épée', race: 'DRAGON_ROUGE' } },
    { key: 'grande-lance', data: { key: 'grande-lance', label: 'Grande lance', race: 'DRAGON_ROUGE' } },
  ],
  eveilPower: [
    { key: 'escorte-du-dragon', data: { key: 'escorte-du-dragon', label: 'Escorte du dragon' } },
    { key: 'couche-du-dragon', data: { key: 'couche-du-dragon', label: 'Couche du dragon' } },
  ],
};

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

function makeHommeDragonService(findOneResult: HommeDragonDto | null = null) {
  return {
    findOne: vi.fn().mockResolvedValue(findOneResult),
    create: vi.fn(),
    update: vi.fn(),
    chooseEveilPower: vi.fn(),
  };
}

function makeCharacterService() {
  return { getGameSystemContent: vi.fn().mockResolvedValue(CATALOG) };
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
) {
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
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, hommeDragonSvc, characterSvc };
}

describe('HommeDragonSheet', () => {
  it("aucun Homme Dragon existant → formulaire de création affiché, mondesProteges pré-rempli avec le nom de la Partie (AC1)", async () => {
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

  it("changement d'artefact (AC4) appelle update() et met à jour la fiche affichée", async () => {
    const hommeDragonSvc = makeHommeDragonService(makeDto());
    hommeDragonSvc.update.mockResolvedValue(
      makeDto({ sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grande-epee' }, nom: 'Ignis' } }),
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
    const { fixture } = await createComponent(makeHommeDragonService(makeDto({ voyageursProteges: [] })));

    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__voyageurs ul'))).toBeFalsy();
    expect((fixture.nativeElement.textContent as string)).toContain('Aucun voyageur');
  });

  it('historique vide → état vide, pas de liste (AC2)', async () => {
    const { fixture } = await createComponent(makeHommeDragonService(makeDto({ historique: [] })));

    expect(fixture.debugElement.query(By.css('.homme-dragon-sheet__historique ul'))).toBeFalsy();
    expect((fixture.nativeElement.textContent as string)).toContain('Aucun scénario joué');
  });

  it('niveau et Points de Souffle affichés sur la fiche existante (AC1, AC2, Story 10.3)', async () => {
    const { fixture } = await createComponent(
      makeHommeDragonService(makeDto({ derived: { level: 3, PS: 5 } })),
    );

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Niveau : 3');
    expect(text).toContain('Points de Souffle : 5');
  });

  it("aucun élément interactif dans la section niveau/PS — lecture seule, aucun forçage possible (AC4)", async () => {
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
    const options = prompt.queryAll(By.css('option')).map((o) => o.nativeElement.textContent.trim());
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
    expect(component['hommeDragon']()?.eveilPowers).toEqual([{ level: 2, key: 'escorte-du-dragon' }]);
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

  it("eveilPowers non vide → liste affichée avec les libellés résolus, pas les clés", async () => {
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
});
