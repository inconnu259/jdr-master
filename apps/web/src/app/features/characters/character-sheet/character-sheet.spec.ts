import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import type { AuthUser, CharacterDto, GameSystemContentDto } from '@master-jdr/shared';
import { CharacterSheet } from './character-sheet';
import { CharacterService } from '../../../core/characters/character.service';
import { AuthService } from '../../../core/auth/auth.service';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';

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

const CHARACTER: CharacterDto = makeCharacterDto({
  sheetData: {
    classId: 'menestrel',
    typeId: 'technique',
    weaponCategoryId: 'lance',
    attributes: { VIG: 8, AGI: 4, INT: 6, ESP: 6 },
    equipment: { individual: ['Nécessaire de voyage'], group: ['Nécessaire de groupe'] },
    fetiqueObject: 'une plume de corbeau',
    narrative: { name: 'Fenn', homeTown: 'Aubval', motivation: 'Voir la mer' },
  },
});

function makeCharacterService(overrides: Partial<ReturnType<typeof defaultSvc>> = {}) {
  return { ...defaultSvc(), ...overrides };
}

function defaultSvc() {
  return {
    get: vi.fn().mockResolvedValue(CHARACTER),
    getGameSystemContent: vi.fn().mockResolvedValue(CONTENT),
    exportPdf: vi.fn().mockResolvedValue(new Blob(['%PDF-1.6'], { type: 'application/pdf' })),
    updatePortrait: vi.fn(),
    patchPdfPortraitCrop: vi.fn(),
  };
}

async function createComponent(
  characterSvc = makeCharacterService(),
  characterId: string | null = 'char1',
  dialogResult: unknown = null,
  currentUserId: string | null = 'u1',
) {
  const dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(dialogResult) }) };
  const auth = {
    currentUser: signal<AuthUser | null>(
      currentUserId ? ({ id: currentUserId } as AuthUser) : null,
    ),
  };
  await TestBed.configureTestingModule({
    imports: [CharacterSheet],
    providers: [
      { provide: CharacterService, useValue: characterSvc },
      { provide: MatDialog, useValue: dialog },
      { provide: AuthService, useValue: auth },
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
  return { fixture, characterSvc, dialog, auth };
}

describe('CharacterSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

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

  it('composant détruit avant la résolution de get() → pas d’erreur (résolution tardive sans garde)', async () => {
    // Angular ne lève aucune erreur/avertissement quand un signal est mis à jour sur un composant
    // déjà détruit (ce n'est ni un ChangeDetectorRef ni un effect() actif) — pas de garde
    // `destroyed` nécessaire ici, juste la garantie que la résolution tardive ne plante pas.
    let resolveGet!: (c: CharacterDto) => void;
    const characterSvc = makeCharacterService({
      get: vi.fn(() => new Promise<CharacterDto>((resolve) => (resolveGet = resolve))),
    });
    const dialog = { open: vi.fn() };
    const auth = { currentUser: signal<AuthUser | null>({ id: 'u1' } as AuthUser) };
    await TestBed.configureTestingModule({
      imports: [CharacterSheet],
      providers: [
        { provide: CharacterService, useValue: characterSvc },
        { provide: MatDialog, useValue: dialog },
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'char1' } } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CharacterSheet);
    fixture.detectChanges();

    fixture.destroy();
    expect(() => resolveGet(CHARACTER)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
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

  it('clic sur "Exporter en PDF (éditable)" → appelle exportPdf(id, "editable") et déclenche un téléchargement', async () => {
    const { fixture, characterSvc } = await createComponent();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

    const buttons = fixture.nativeElement.querySelectorAll(
      '.sheet__export-actions button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(characterSvc.exportPdf).toHaveBeenCalledWith('char1', 'editable');
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('clic sur "Exporter en PDF (2 pages)" → appelle exportPdf(id, "2pages")', async () => {
    const { fixture, characterSvc } = await createComponent();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);

    const buttons = fixture.nativeElement.querySelectorAll(
      '.sheet__export-actions button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(characterSvc.exportPdf).toHaveBeenCalledWith('char1', '2pages');
  });

  it("échec de l'export → message d'erreur affiché, pas de plantage", async () => {
    const characterSvc = makeCharacterService({
      exportPdf: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const { fixture } = await createComponent(characterSvc);

    const buttons = fixture.nativeElement.querySelectorAll(
      '.sheet__export-actions button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const comp = fixture.componentInstance as any;
    expect(comp.exportError()).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(comp.exportError());
  });

  it('propriétaire consultant sa propre fiche → aucun badge/pseudo affiché', async () => {
    const { fixture } = await createComponent(makeCharacterService(), 'char1', null, 'u1');
    expect(fixture.nativeElement.querySelector('.sheet__owner-badge')).toBeNull();
  });

  it('MJ (non-propriétaire) consultant la fiche d’un joueur → pseudo du propriétaire affiché (AC2)', async () => {
    const { fixture } = await createComponent(makeCharacterService(), 'char1', null, 'mj-stranger');
    const badge = fixture.nativeElement.querySelector('.sheet__owner-badge');
    expect(badge?.textContent?.trim()).toBe('alice');
  });

  it('MJ consultant la fiche de son propre personnage → aucun badge affiché (isOwner prime sur viewerIsMj)', async () => {
    const mjOwnCharacter: CharacterDto = {
      ...CHARACTER,
      userId: 'mj1',
      ownerIsMj: true,
      ownerPseudo: 'le-mj',
    };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(mjOwnCharacter) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj1');
    // Le MJ est propriétaire de son propre personnage → isOwner()=true → viewerIsMj()=false → aucun badge.
    expect(fixture.nativeElement.querySelector('.sheet__owner-badge')).toBeNull();
  });

  it('sans portrait → aucun PortraitPanel affiché', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.querySelector('.portrait-panel')).toBeNull();
  });

  it('avec portrait → PortraitPanel affiché', async () => {
    const withPortrait: CharacterDto = {
      ...CHARACTER,
      portraitUrl: '/uploads/portraits/x.jpg',
      portraitCropData: { scale: 1, offsetX: 0, offsetY: 0 },
    };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(withPortrait) });
    const { fixture } = await createComponent(characterSvc);
    expect(fixture.nativeElement.querySelector('.portrait-panel')).not.toBeNull();
  });

  it('clic sur "Modifier le portrait" → ouvre le dialogue PortraitCropper', async () => {
    const { fixture, dialog } = await createComponent();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__portrait-edit-cta');
    btn.click();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('MJ consultant la fiche d\'un personnage qui n\'est pas le sien → CTA "Modifier le portrait" absent (lecture seule, FR39)', async () => {
    const { fixture } = await createComponent(makeCharacterService(), 'char1', null, 'mj-stranger');
    expect(fixture.nativeElement.querySelector('.sheet__portrait-edit-cta')).toBeNull();
  });

  it("editPortrait() ne fait rien si appelé alors qu'on n'est pas le propriétaire (défense en profondeur)", async () => {
    const { fixture, dialog } = await createComponent(
      makeCharacterService(),
      'char1',
      null,
      'mj-stranger',
    );
    const comp = fixture.componentInstance as any;
    comp.editPortrait();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('double-clic rapide sur "Modifier le portrait" (dialogue encore ouvert) → un seul dialogue ouvert', async () => {
    const afterClosedSubject = new Subject<unknown>();
    const dialog = {
      open: vi.fn().mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() }),
    };
    await TestBed.configureTestingModule({
      imports: [CharacterSheet],
      providers: [
        { provide: CharacterService, useValue: makeCharacterService() },
        { provide: MatDialog, useValue: dialog },
        {
          provide: AuthService,
          useValue: { currentUser: signal<AuthUser | null>({ id: 'u1' } as AuthUser) },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'char1' } } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CharacterSheet);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__portrait-edit-cta');
    btn.click();
    btn.click();

    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('dialogue résolu avec un résultat → appelle updatePortrait puis rafraîchit le personnage affiché', async () => {
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const cropData = { scale: 1.2, offsetX: 0, offsetY: 0 };
    const updated = {
      ...CHARACTER,
      portraitUrl: '/uploads/portraits/new.jpg',
      portraitCropData: cropData,
    };
    const characterSvc = makeCharacterService({
      updatePortrait: vi.fn().mockResolvedValue(updated),
    });
    const { fixture } = await createComponent(characterSvc, 'char1', { file, cropData });

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__portrait-edit-cta');
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(characterSvc.updatePortrait).toHaveBeenCalledWith('char1', file, cropData);
    const comp = fixture.componentInstance as any;
    expect(comp.character().portraitUrl).toBe('/uploads/portraits/new.jpg');
  });

  it('dialogue annulé (résultat null) → aucun appel à updatePortrait', async () => {
    const characterSvc = makeCharacterService();
    const { fixture } = await createComponent(characterSvc, 'char1', null);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__portrait-edit-cta');
    btn.click();
    await Promise.resolve();

    expect(characterSvc.updatePortrait).not.toHaveBeenCalled();
  });

  it("échec de la mise à jour du portrait → message d'erreur affiché, pas de plantage", async () => {
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const cropData = { scale: 1, offsetX: 0, offsetY: 0 };
    const characterSvc = makeCharacterService({
      updatePortrait: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const { fixture } = await createComponent(characterSvc, 'char1', { file, cropData });

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__portrait-edit-cta');
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const comp = fixture.componentInstance as any;
    expect(comp.portraitError()).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(comp.portraitError());
  });

  it('CTA "Ajuster le cadrage PDF" absent si le personnage n\'a pas de portrait', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.querySelector('.sheet__pdf-crop-edit-cta')).toBeNull();
  });

  it('propriétaire + portrait existant → clic sur "Ajuster le cadrage PDF" ouvre le dialogue en mode rect', async () => {
    const withPortrait = { ...CHARACTER, portraitUrl: '/uploads/portraits/x.jpg' };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(withPortrait) });
    const { fixture, dialog } = await createComponent(characterSvc);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__pdf-crop-edit-cta');
    btn.click();

    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ characterId: 'char1', shape: 'rect' }),
      }),
    );
  });

  it('MJ (non-propriétaire) → CTA "Ajuster le cadrage PDF" absent (lecture seule, FR39)', async () => {
    const withPortrait = { ...CHARACTER, portraitUrl: '/uploads/portraits/x.jpg' };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(withPortrait) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
    expect(fixture.nativeElement.querySelector('.sheet__pdf-crop-edit-cta')).toBeNull();
  });

  it('dialogue résolu → appelle patchPdfPortraitCrop puis rafraîchit le personnage affiché', async () => {
    const withPortrait = { ...CHARACTER, portraitUrl: '/uploads/portraits/x.jpg' };
    const cropData = { scale: 1.3, offsetX: 5, offsetY: -5 };
    const updated = { ...withPortrait, pdfPortraitCropData: cropData };
    const characterSvc = makeCharacterService({
      get: vi.fn().mockResolvedValue(withPortrait),
      patchPdfPortraitCrop: vi.fn().mockResolvedValue(updated),
    });
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const { fixture } = await createComponent(characterSvc, 'char1', { file, cropData });

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__pdf-crop-edit-cta');
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(characterSvc.patchPdfPortraitCrop).toHaveBeenCalledWith('char1', cropData);
    const comp = fixture.componentInstance as any;
    expect(comp.character().pdfPortraitCropData).toEqual(cropData);
  });

  it("échec de patchPdfPortraitCrop → message d'erreur affiché, pas de plantage", async () => {
    const withPortrait = { ...CHARACTER, portraitUrl: '/uploads/portraits/x.jpg' };
    const cropData = { scale: 1, offsetX: 0, offsetY: 0 };
    const characterSvc = makeCharacterService({
      get: vi.fn().mockResolvedValue(withPortrait),
      patchPdfPortraitCrop: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const { fixture } = await createComponent(characterSvc, 'char1', { file, cropData });

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.sheet__pdf-crop-edit-cta');
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const comp = fixture.componentInstance as any;
    expect(comp.portraitError()).toBeTruthy();
  });
});
