import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import type { GameSystemContentDto, GameSystemSchemaDto } from '@master-jdr/shared';
import { CharacterWizard } from './character-wizard';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const SCHEMA: GameSystemSchemaDto = {
  sheetSchema: {},
  creationSteps: [
    { key: 'classId', label: 'Classe' },
    { key: 'typeId', label: 'Type' },
    { key: 'attributes', label: 'Attributs' },
    { key: 'weaponCategoryId', label: 'Arme favorite' },
    { key: 'fetiqueObject', label: 'Objet fétiche' },
    { key: 'equipment', label: 'Équipement' },
    { key: 'narrative', label: 'Narratif' },
    { key: 'portrait', label: 'Portrait' },
  ],
};

const CONTENT: GameSystemContentDto = {
  class: [
    { key: 'chasseur', data: { label: 'Chasseur', talents: [{ name: 'Pistage', effect: '...' }] } },
    {
      key: 'artisan',
      data: {
        label: 'Artisan',
        talents: [{ name: 'Création', effect: '...' }],
        requiresSpecialty: true,
      },
    },
  ],
  type: [
    {
      key: 'attaque',
      data: { label: 'Attaque', advantages: [{ name: 'Endurance', effect: '+4 PV' }] },
    },
  ],
  attributePattern: [{ key: 'polyvalent', data: { label: 'Polyvalent', values: [8, 4, 6, 6] } }],
  weaponCategory: [
    { key: 'arc', data: { label: 'Arc', touchFormula: 'AGI+INT-2', damageFormula: 'AGI' } },
  ],
};

function makeCharacterService() {
  return {
    getGameSystemSchema: vi.fn().mockResolvedValue(SCHEMA),
    getGameSystemContent: vi.fn().mockResolvedValue(CONTENT),
    create: vi.fn(),
    updatePortrait: vi.fn(),
  };
}

function makeThemeService() {
  return { tone: () => ({ 'character.create_cta': 'Créer un voyageur' }) };
}

async function createComponent(partieId = 'p1') {
  const characterSvc = makeCharacterService();
  const router = { navigate: vi.fn() };
  const snack = { open: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [CharacterWizard],
    providers: [
      provideAnimationsAsync(),
      { provide: CharacterService, useValue: characterSvc },
      { provide: ThemeToneService, useValue: makeThemeService() },
      { provide: MatSnackBar, useValue: snack },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => partieId } } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CharacterWizard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, characterSvc, router, snack };
}

describe('CharacterWizard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("charge le schéma ET le contenu du système de jeu au démarrage, affiche l'étape Classe", async () => {
    const { fixture, characterSvc } = await createComponent();
    expect(characterSvc.getGameSystemSchema).toHaveBeenCalledWith('ryuutama');
    expect(characterSvc.getGameSystemContent).toHaveBeenCalledWith('ryuutama');
    const comp = fixture.componentInstance as any;
    expect(comp.currentStepKey()).toBe('classId');
    expect(comp.canGoNext()).toBe(false);
  });

  it('dérive ses 8 étapes depuis creationSteps() du schéma, sans coder les clés en dur (AC1) — inclut Portrait (Story 4.5)', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;
    expect(comp.steps().map((s: { key: string }) => s.key)).toEqual([
      'classId',
      'typeId',
      'attributes',
      'weaponCategoryId',
      'fetiqueObject',
      'equipment',
      'narrative',
      'portrait',
    ]);
  });

  it('erreur au chargement (schéma ou contenu) → message affiché, pas de plantage silencieux', async () => {
    const characterSvc = {
      getGameSystemSchema: vi.fn().mockRejectedValue(new Error('network down')),
      getGameSystemContent: vi.fn().mockResolvedValue(CONTENT),
      create: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [CharacterWizard],
      providers: [
        provideAnimationsAsync(),
        { provide: CharacterService, useValue: characterSvc },
        { provide: ThemeToneService, useValue: makeThemeService() },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CharacterWizard);
    fixture.detectChanges();
    // ngOnInit enchaîne un Promise.all() qui rejette — whenStable() ne garantit pas toujours le
    // drainage complet de la chaîne de microtasks en environnement zoneless (même pattern que
    // partie-detail.spec.ts).
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(comp.loadError());
  });

  it('classe Artisan sans spécialité → canGoNext=false ; avec spécialité → true', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;

    comp.updateSheetData({ classId: 'artisan' });
    fixture.detectChanges();
    expect(comp.canGoNext()).toBe(false);

    comp.updateSheetData({ specialtyTypeId: 'Amulette' });
    fixture.detectChanges();
    expect(comp.canGoNext()).toBe(true);
  });

  it('changer de classe après Artisan efface la spécialité obsolète', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;

    comp.updateSheetData({ classId: 'artisan' });
    comp.updateSheetData({ specialtyTypeId: 'Amulette' });
    fixture.detectChanges();
    expect(comp.sheetData().specialtyTypeId).toBe('Amulette');

    comp.updateSheetData({ classId: 'chasseur' });
    fixture.detectChanges();
    expect(comp.sheetData().specialtyTypeId).toBeUndefined();
  });

  it('derived() reste null tant que les attributs ne sont pas assignés, puis se calcule en direct', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;

    expect(comp.derived()).toBeNull();

    comp.onAttributesChange({ AGI: 4, ESP: 6, INT: 6, VIG: 8 });
    fixture.detectChanges();

    expect(comp.derived()).toEqual({
      PV: 16,
      PE: 12,
      Condition: 14,
      Initiative: 10,
      Encombrement: 11,
    });
  });

  it('goNext() ne franchit pas une étape si canGoNext=false', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;

    comp.goNext(); // classId vide → bloqué
    expect(comp.currentStepIndex()).toBe(0);

    comp.updateSheetData({ classId: 'chasseur' });
    fixture.detectChanges();
    comp.goNext();
    expect(comp.currentStepIndex()).toBe(1);
  });

  it('soumission réussie → POST puis redirection vers la fiche du personnage créé', async () => {
    const { fixture, characterSvc, router } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    characterSvc.create.mockResolvedValue({ id: 'char1' });

    await comp.onSubmit();

    expect(characterSvc.create).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ gameSystemId: 'ryuutama' }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'characters', 'char1']);
  });

  it('soumission 400 sur "attributes" → retour à l\'étape fautive avec les erreurs contextualisées', async () => {
    const { fixture, characterSvc } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    comp.currentStepIndex.set(3); // simulate being on a later step

    characterSvc.create.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { message: [{ field: 'attributes', message: 'Pattern invalide' }] },
      }),
    );

    await comp.onSubmit();

    expect(comp.currentStepIndex()).toBe(2); // attributes → step index 2
    expect(comp.stepErrors()['attributes']).toEqual(['Pattern invalide']);
  });

  it('soumission 400 sur "specialtyTypeId" → retour à l\'étape Classe ET affiche le message (bug corrigé)', async () => {
    const { fixture, characterSvc } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    comp.currentStepIndex.set(3);

    characterSvc.create.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: {
          message: [
            { field: 'specialtyTypeId', message: 'Spécialité obligatoire pour la classe Artisan' },
          ],
        },
      }),
    );

    await comp.onSubmit();

    expect(comp.currentStepIndex()).toBe(0); // classId → step index 0
    // Le message doit être accessible sous la clé de l'étape ('classId'), pas 'specialtyTypeId'.
    expect(comp.stepErrors()['classId']).toEqual(['Spécialité obligatoire pour la classe Artisan']);
  });

  it('soumission 400 générique (tableau de strings, pas de {field,message}) → notification sans plantage', async () => {
    const { fixture, characterSvc, snack } = await createComponent('p1');
    const comp = fixture.componentInstance as any;

    characterSvc.create.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { message: ['gameSystemId should not be empty'] },
      }),
    );

    await comp.onSubmit();

    expect(snack.open).toHaveBeenCalled();
  });

  it('soumission 409 → notification et redirection vers /parties/:id', async () => {
    const { fixture, characterSvc, router, snack } = await createComponent('p1');
    const comp = fixture.componentInstance as any;

    characterSvc.create.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: { message: 'Vous avez déjà un personnage sur cette partie' },
      }),
    );

    await comp.onSubmit();

    expect(snack.open).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1']);
  });

  it('soumission 500 → notification générique, pas de rejet de promesse non géré', async () => {
    const { fixture, characterSvc, snack } = await createComponent('p1');
    const comp = fixture.componentInstance as any;

    characterSvc.create.mockRejectedValue(
      new HttpErrorResponse({ status: 500, error: { message: 'Internal error' } }),
    );

    await expect(comp.onSubmit()).resolves.not.toThrow();
    expect(snack.open).toHaveBeenCalled();
  });

  it('onPortraitSkip() finalise directement (Passer cette étape = créer sans portrait, AC1)', async () => {
    const { fixture, characterSvc, router } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    characterSvc.create.mockResolvedValue({ id: 'char1' });

    await comp.onPortraitSkip();

    expect(characterSvc.create).toHaveBeenCalled();
    expect(characterSvc.updatePortrait).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'characters', 'char1']);
  });

  it('onPortraitSaved() puis onSubmit() → uploade le portrait après la création réussie (AC2)', async () => {
    const { fixture, characterSvc, router } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    characterSvc.create.mockResolvedValue({ id: 'char1' });
    characterSvc.updatePortrait.mockResolvedValue({ id: 'char1', portraitUrl: '/x.jpg' });
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const cropData = { scale: 1.2, offsetX: 0, offsetY: 0 };

    comp.onPortraitSaved({ file, cropData });
    await comp.onSubmit();

    expect(characterSvc.updatePortrait).toHaveBeenCalledWith('char1', file, cropData);
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'characters', 'char1']);
  });

  it("échec de l'upload du portrait après création réussie → n'empêche pas la redirection, avertit via snackbar", async () => {
    const { fixture, characterSvc, router, snack } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    characterSvc.create.mockResolvedValue({ id: 'char1' });
    characterSvc.updatePortrait.mockRejectedValue(new Error('network down'));
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });

    comp.onPortraitSaved({ file, cropData: { scale: 1, offsetX: 0, offsetY: 0 } });
    await comp.onSubmit();

    expect(snack.open).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'characters', 'char1']);
  });

  it("sans fichier sélectionné (pendingPortraitFile null) → onSubmit() ne tente pas d'upload", async () => {
    const { fixture, characterSvc } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    characterSvc.create.mockResolvedValue({ id: 'char1' });

    await comp.onSubmit();

    expect(characterSvc.updatePortrait).not.toHaveBeenCalled();
  });

  it('les boutons de navigation sont désactivés pendant submitting()', async () => {
    const { fixture } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    comp.updateSheetData({ classId: 'chasseur' });
    comp.submitting.set(true);
    fixture.detectChanges();

    expect(comp.goNext()).toBeUndefined();
    const before = comp.currentStepIndex();
    comp.goNext();
    expect(comp.currentStepIndex()).toBe(before);
  });
});
