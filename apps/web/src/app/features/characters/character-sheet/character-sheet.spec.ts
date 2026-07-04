import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import type { CharacterDto, GameSystemContentDto } from '@master-jdr/shared';
import { CharacterSheet } from './character-sheet';
import { CharacterService } from '../../../core/characters/character.service';

const CONTENT: GameSystemContentDto = {
  class: [
    {
      key: 'menestrel',
      data: { label: 'Ménestrel', talents: [{ name: 'Légendes', effect: '...' }] },
    },
  ],
  type: [
    {
      key: 'technique',
      data: { label: 'Technique', advantages: [{ name: 'Précision', effect: '+2' }] },
    },
  ],
  attributePattern: [{ key: 'polyvalent', data: { label: 'Polyvalent', values: [8, 4, 6, 6] } }],
  weaponCategory: [
    { key: 'lance', data: { label: 'Lance', touchFormula: 'VIG+AGI', damageFormula: 'VIG+1' } },
  ],
};

const CHARACTER: CharacterDto = {
  id: 'char1',
  userId: 'u1',
  partieId: 'p1',
  gameSystemId: 'ryuutama',
  sheetData: {
    classId: 'menestrel',
    typeId: 'technique',
    weaponCategoryId: 'lance',
    attributes: { VIG: 8, AGI: 4, INT: 6, ESP: 6 },
    equipment: { individual: ['Nécessaire de voyage'], group: ['Nécessaire de groupe'] },
    fetiqueObject: 'une plume de corbeau',
    narrative: { name: 'Fenn', homeTown: 'Aubval', motivation: 'Voir la mer' },
  },
  derived: { PV: 16, PE: 12, Condition: 14, Initiative: 10, Encombrement: 11 },
  portraitUrl: null,
  portraitCropData: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeCharacterService(overrides: Partial<ReturnType<typeof defaultSvc>> = {}) {
  return { ...defaultSvc(), ...overrides };
}

function defaultSvc() {
  return {
    get: vi.fn().mockResolvedValue(CHARACTER),
    getGameSystemContent: vi.fn().mockResolvedValue(CONTENT),
  };
}

async function createComponent(
  characterSvc = makeCharacterService(),
  characterId: string | null = 'char1',
) {
  await TestBed.configureTestingModule({
    imports: [CharacterSheet],
    providers: [
      { provide: CharacterService, useValue: characterSvc },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => characterId } } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CharacterSheet);
  fixture.detectChanges();
  // ngOnInit enchaîne un Promise.all() (personnage + contenu) — whenStable() ne garantit pas
  // toujours le drainage complet de la chaîne de microtasks en environnement zoneless.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, characterSvc };
}

describe('CharacterSheet', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('charge le personnage et le contenu, affiche les sections avec labels résolus (pas les clés brutes)', async () => {
    const { fixture, characterSvc } = await createComponent();

    expect(characterSvc.get).toHaveBeenCalledWith('char1');
    expect(characterSvc.getGameSystemContent).toHaveBeenCalledWith('ryuutama');

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Fenn');
    expect(text).toContain('Ménestrel');
    expect(text).toContain('Technique');
    expect(text).toContain('Lance');
    expect(text).toContain('PV 16');
    expect(text).not.toContain('menestrel');
    expect(text).not.toContain('technique');
  });

  it('affiche les notes narratives renseignées uniquement', async () => {
    const { fixture } = await createComponent();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Aubval');
    expect(text).toContain('Voir la mer');
    expect(text).not.toContain('Sexe');
  });

  it("403 → message d'erreur explicite affiché, pas de plantage", async () => {
    const characterSvc = makeCharacterService({
      get: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 403 })),
    });
    const { fixture } = await createComponent(characterSvc);

    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBe("Vous n'avez pas accès à cette fiche.");
    expect(fixture.nativeElement.textContent).toContain("Vous n'avez pas accès à cette fiche.");
  });

  it('erreur réseau générique → message affiché, pas de plantage', async () => {
    const characterSvc = makeCharacterService({
      get: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const { fixture } = await createComponent(characterSvc);

    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(comp.loadError());
  });

  it("characterId absent du paramMap → message d'erreur affiché, pas de plantage ni chargement infini", async () => {
    const characterSvc = makeCharacterService();
    const { fixture } = await createComponent(characterSvc, null);

    expect(characterSvc.get).not.toHaveBeenCalled();
    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBe('Fiche introuvable.');
    expect(fixture.nativeElement.textContent).toContain('Fiche introuvable.');
  });

  it('échec du chargement du contenu de jeu (getGameSystemContent) → la fiche du personnage reste affichée', async () => {
    const characterSvc = makeCharacterService({
      getGameSystemContent: vi.fn().mockRejectedValue(new Error('content down')),
    });
    const { fixture } = await createComponent(characterSvc);

    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBeNull();
    expect(comp.character()).toEqual(CHARACTER);
    expect(fixture.nativeElement.textContent).toContain('Fenn');
  });

  it('affiche la spécialité (specialtyTypeId) pour la classe Artisan quand renseignée', async () => {
    const artisan: CharacterDto = {
      ...CHARACTER,
      sheetData: { ...CHARACTER.sheetData, classId: 'artisan', specialtyTypeId: 'Forgeron' },
    };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(artisan) });
    const { fixture } = await createComponent(characterSvc);

    expect(fixture.nativeElement.textContent).toContain('Forgeron');
  });
});
