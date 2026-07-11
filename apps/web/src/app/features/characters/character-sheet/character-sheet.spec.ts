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
  landscape: [{ key: 'foret', data: { label: 'Forêt' } }],
};

const CHARACTER: CharacterDto = makeCharacterDto({
  sheetData: {
    classId: 'menestrel',
    typeId: 'technique',
    weaponCategoryId: 'lance',
    attributes: { VIG: 8, AGI: 4, INT: 6, ESP: 6 },
    equipment: {
      individual: [{ id: 'item-1', name: 'Nécessaire de voyage', weight: 0, addedBy: 'player' }],
      group: ['Nécessaire de groupe'],
    },
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
    getHistory: vi.fn().mockResolvedValue([]),
    levelUp: vi.fn(),
    addInventoryItem: vi.fn(),
    updateInventoryItem: vi.fn(),
    removeInventoryItem: vi.fn(),
    getNotes: vi.fn().mockResolvedValue([]),
    addNote: vi.fn(),
    toggleNoteShare: vi.fn(),
    setSheetField: vi.fn(),
    setXp: vi.fn(),
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
    // viewerIsMj résolu côté API (Story 6.5 revue de code) — explicite ici car ce test simule
    // un VRAI MJ, distinct d'un simple fellow player non-MJ (cf. test dédié plus bas).
    const asMj = { ...CHARACTER, viewerIsMj: true };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(asMj) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
    const badge = fixture.nativeElement.querySelector('.sheet__owner-badge');
    expect(badge?.textContent?.trim()).toBe('alice');
  });

  it("fellow player (ni propriétaire, ni MJ) consultant la fiche d'un coéquipier → aucun badge affiché (corrige l'ancienne heuristique 'tout non-propriétaire = MJ', revue de code Story 6.5)", async () => {
    const asFellowPlayer = { ...CHARACTER, viewerIsMj: false };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(asFellowPlayer) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'joueur-tiers');
    expect(fixture.nativeElement.querySelector('.sheet__owner-badge')).toBeNull();
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

  it('niveau affiché dynamique (c.level) au lieu de "Niveau 1" figé', async () => {
    const character = { ...CHARACTER, xp: 3000, level: 6 };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(character) });
    const { fixture } = await createComponent(characterSvc);

    expect(fixture.nativeElement.querySelector('.sheet__meta').textContent).toContain('Niveau 6');
  });

  it('propriétaire avec niveau en attente → LevelUpBanner visible', async () => {
    const character = { ...CHARACTER, xp: 150 };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(character) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'u1');

    expect(fixture.nativeElement.querySelector('.level-up-banner')).not.toBeNull();
  });

  it('propriétaire sans niveau en attente → LevelUpBanner absent', async () => {
    const { fixture } = await createComponent(makeCharacterService(), 'char1', null, 'u1');
    expect(fixture.nativeElement.querySelector('.level-up-banner')).toBeNull();
  });

  it('MJ (non-propriétaire) → LevelUpBanner jamais affiché, même avec niveau en attente', async () => {
    const character = { ...CHARACTER, xp: 150 };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(character) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');

    expect(fixture.nativeElement.querySelector('.level-up-banner')).toBeNull();
  });

  it('propriétaire → section Historique visible', async () => {
    const { fixture } = await createComponent(makeCharacterService(), 'char1', null, 'u1');
    expect(fixture.nativeElement.querySelector('.sheet__history')).not.toBeNull();
  });

  it('MJ (non-propriétaire) → section Historique visible également (AC4)', async () => {
    const asMj = { ...CHARACTER, viewerIsMj: true };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(asMj) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
    expect(fixture.nativeElement.querySelector('.sheet__history')).not.toBeNull();
  });

  it("fellow player (ni propriétaire, ni MJ) → section Historique ABSENTE (corrige la fuite d'accès identifiée en revue de code Story 6.5 : un fellow player pouvait auparavant la voir, sans jamais accéder aux données réelles derrière — getHistory reste MJ-seul côté serveur)", async () => {
    const asFellowPlayer = { ...CHARACTER, viewerIsMj: false };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(asFellowPlayer) });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'joueur-tiers');
    expect(fixture.nativeElement.querySelector('.sheet__history')).toBeNull();
  });

  it('aucune capacité sans section dédiée → section "Autres capacités" absente', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.textContent).not.toContain('Autres capacités');
  });

  it('capacité sans section dédiée (protection d\'un dragon) → section "Autres capacités" affichée, visible aussi pour le MJ', async () => {
    const withDragonProtection = {
      ...CHARACTER,
      sheetData: {
        ...CHARACTER.sheetData,
        levelUps: [
          {
            level: 9,
            pvAllocated: 2,
            peAllocated: 1,
            capabilities: [{ type: 'dragon-protection', params: { key: 'ete' } }],
          },
        ],
      },
    };
    const characterSvc = makeCharacterService({
      get: vi.fn().mockResolvedValue(withDragonProtection),
    });
    const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Autres capacités');
    expect(text).toContain("Protection d'un dragon");
    expect(text).not.toContain('Niveau 9 — ');
  });

  it('capacité structurelle (attribut/paysage/immunité/classe/type) → jamais dans "Autres capacités"', async () => {
    const withStructural = {
      ...CHARACTER,
      sheetData: {
        ...CHARACTER.sheetData,
        levelUps: [
          {
            level: 2,
            pvAllocated: 2,
            peAllocated: 1,
            capabilities: [{ type: 'attribute', params: { attribute: 'VIG' } }],
          },
        ],
      },
    };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(withStructural) });
    const { fixture } = await createComponent(characterSvc);

    expect(fixture.nativeElement.textContent).not.toContain('Autres capacités');
  });

  it('classe secondaire (capacité class) → sous-bloc "Classe secondaire" dans Vocation, avec ses talents', async () => {
    const withSecondaryClass = {
      ...CHARACTER,
      sheetData: {
        ...CHARACTER.sheetData,
        levelUps: [
          {
            level: 5,
            pvAllocated: 0,
            peAllocated: 3,
            capabilities: [{ type: 'class', params: { key: 'marchand' } }],
          },
        ],
      },
    };
    const contentWithMarchand: GameSystemContentDto = {
      ...CONTENT,
      class: [
        ...(CONTENT['class'] ?? []),
        {
          key: 'marchand',
          data: { label: 'Marchand', talents: [{ name: 'Négociation', effect: 'Baisse un prix' }] },
        },
      ],
    };
    const characterSvc = makeCharacterService({
      get: vi.fn().mockResolvedValue(withSecondaryClass),
      getGameSystemContent: vi.fn().mockResolvedValue(contentWithMarchand),
    });
    const { fixture } = await createComponent(characterSvc);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Classe secondaire : Marchand');
    expect(text).toContain('Négociation');
  });

  it('type secondaire (capacité type) → sous-bloc "Type secondaire" dans Voie, avec ses avantages', async () => {
    const withSecondaryType = {
      ...CHARACTER,
      sheetData: {
        ...CHARACTER.sheetData,
        levelUps: [
          {
            level: 6,
            pvAllocated: 1,
            peAllocated: 2,
            capabilities: [{ type: 'type', params: { key: 'magie' } }],
          },
        ],
      },
    };
    const contentWithMagie: GameSystemContentDto = {
      ...CONTENT,
      type: [
        ...(CONTENT['type'] ?? []),
        {
          key: 'magie',
          data: { label: 'Magie', advantages: [{ name: 'Incantation', effect: '+2' }] },
        },
      ],
    };
    const characterSvc = makeCharacterService({
      get: vi.fn().mockResolvedValue(withSecondaryType),
      getGameSystemContent: vi.fn().mockResolvedValue(contentWithMagie),
    });
    const { fixture } = await createComponent(characterSvc);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Type secondaire : Magie');
    expect(text).toContain('Incantation');
  });

  it('paysage obtenu → nouvelle section Paysage/Climat favori affichée avec "+2 aux tests appropriés"', async () => {
    const withLandscape = {
      ...CHARACTER,
      sheetData: {
        ...CHARACTER.sheetData,
        levelUps: [
          {
            level: 3,
            pvAllocated: 1,
            peAllocated: 2,
            capabilities: [{ type: 'landscape', params: { key: 'foret' } }],
          },
        ],
      },
    };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(withLandscape) });
    const { fixture } = await createComponent(characterSvc);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Paysage/Climat favori');
    expect(text).toContain('Forêt');
    expect(text).toContain('+2 aux tests appropriés');
  });

  it('aucun paysage obtenu → section Paysage/Climat favori absente', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.textContent).not.toContain('Paysage/Climat favori');
  });

  it('immunité obtenue → nouvelle section Immunités affichée', async () => {
    const withImmunity = {
      ...CHARACTER,
      sheetData: {
        ...CHARACTER.sheetData,
        levelUps: [
          {
            level: 4,
            pvAllocated: 2,
            peAllocated: 1,
            capabilities: [{ type: 'immunity', params: { key: 'blesse' } }],
          },
        ],
      },
    };
    const contentWithImmunity: GameSystemContentDto = {
      ...CONTENT,
      immunityState: [{ key: 'blesse', data: { label: 'Blessé' } }],
    };
    const characterSvc = makeCharacterService({
      get: vi.fn().mockResolvedValue(withImmunity),
      getGameSystemContent: vi.fn().mockResolvedValue(contentWithImmunity),
    });
    const { fixture } = await createComponent(characterSvc);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Immunités');
    expect(text).toContain('Blessé');
  });

  it('aucune immunité obtenue → section Immunités absente', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.textContent).not.toContain('Immunités');
  });

  it('XP affiché comme stat-pill dans Statistiques dérivées', async () => {
    const withXp = { ...CHARACTER, xp: 250 };
    const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(withXp) });
    const { fixture } = await createComponent(characterSvc);

    expect(fixture.nativeElement.textContent).toContain('XP 250');
  });

  it('section Inventaire visible pour le propriétaire', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.querySelector('app-inventory-tab')).not.toBeNull();
  });

  it('section Inventaire visible pour le MJ (lecture) — équipement individuel non dupliqué dans la carte Équipement', async () => {
    const { fixture } = await createComponent(makeCharacterService(), 'char1', null, 'mj-stranger');
    expect(fixture.nativeElement.querySelector('app-inventory-tab')).not.toBeNull();
    // "Nécessaire de voyage" (individual) ne doit plus apparaître dans la carte "Équipement" —
    // seul "Nécessaire de groupe" (group) y reste (régression Story 6.4, cf. Task 10).
    const equipmentCard = Array.from(fixture.nativeElement.querySelectorAll('.sheet__card')).find(
      (card: any) => card.textContent.includes('Équipement'),
    ) as HTMLElement;
    expect(equipmentCard.textContent).not.toContain('Nécessaire de voyage');
    expect(equipmentCard.textContent).toContain('Nécessaire de groupe');
  });

  it('section Notes visible pour le propriétaire, isOwner=true transmis', async () => {
    const { fixture } = await createComponent();
    const notesEl = fixture.nativeElement.querySelector('app-notes-journal');
    expect(notesEl).not.toBeNull();
  });

  it('section Notes visible pour le MJ (lecture)', async () => {
    const { fixture } = await createComponent(makeCharacterService(), 'char1', null, 'mj-stranger');
    expect(fixture.nativeElement.querySelector('app-notes-journal')).not.toBeNull();
  });

  it('section Notes visible pour un participant tiers (ni propriétaire ni MJ) — Story 6.5 AC4', async () => {
    const { fixture } = await createComponent(
      makeCharacterService(),
      'char1',
      null,
      'joueur-tiers',
    );
    expect(fixture.nativeElement.querySelector('app-notes-journal')).not.toBeNull();
  });

  describe('édition MJ (FieldEditPencil, Story 6.6)', () => {
    it('viewerIsMj:true → pencils attributs (×4) + objet fétiche + XP visibles', async () => {
      const asMj = { ...CHARACTER, viewerIsMj: true };
      const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(asMj) });
      const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');

      const pencils = fixture.nativeElement.querySelectorAll('.field-edit-pencil__button');
      // 4 attributs + fétiche + XP = 6 pencils (l'inventaire est géré séparément par InventoryTab).
      expect(pencils.length).toBe(6);
    });

    it('propriétaire (isOwner:true) → aucun pencil MJ visible', async () => {
      const { fixture } = await createComponent();
      expect(fixture.nativeElement.querySelectorAll('.field-edit-pencil__button').length).toBe(0);
    });

    it('fellow player (ni propriétaire, ni MJ) → aucun pencil MJ visible', async () => {
      const asFellowPlayer = { ...CHARACTER, viewerIsMj: false };
      const characterSvc = makeCharacterService({ get: vi.fn().mockResolvedValue(asFellowPlayer) });
      const { fixture } = await createComponent(characterSvc, 'char1', null, 'joueur-tiers');
      expect(fixture.nativeElement.querySelectorAll('.field-edit-pencil__button').length).toBe(0);
    });

    it('submitFieldEdit() appelle setSheetField avec le bon path, met à jour character() avec result.character', async () => {
      const updated = {
        ...CHARACTER,
        viewerIsMj: true,
        sheetData: { ...CHARACTER.sheetData, fetiqueObject: 'un galet gravé' },
      };
      const asMj = { ...CHARACTER, viewerIsMj: true };
      const characterSvc = makeCharacterService({
        get: vi.fn().mockResolvedValue(asMj),
        setSheetField: vi.fn().mockResolvedValue({ character: updated, warnings: [] }),
      });
      const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
      const comp = fixture.componentInstance as any;

      await comp.submitFieldEdit('fetiqueObject', 'un galet gravé');
      fixture.detectChanges();

      expect(characterSvc.setSheetField).toHaveBeenCalledWith(
        'char1',
        'fetiqueObject',
        'un galet gravé',
      );
      expect(comp.character()).toEqual(updated);
    });

    it('submitFieldEdit() affiche les warnings non bloquants renvoyés par le serveur', async () => {
      const asMj = { ...CHARACTER, viewerIsMj: true };
      const characterSvc = makeCharacterService({
        get: vi.fn().mockResolvedValue(asMj),
        setSheetField: vi.fn().mockResolvedValue({
          character: asMj,
          warnings: ['Classe hors catalogue seedé'],
        }),
      });
      const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
      const comp = fixture.componentInstance as any;

      await comp.submitFieldEdit('classId', 'classe-maison');
      fixture.detectChanges();

      expect(comp.fieldEditWarning()).toContain('Classe hors catalogue seedé');
    });

    it('submitFieldEdit() erreur réseau → fieldEditError() affiché', async () => {
      const asMj = { ...CHARACTER, viewerIsMj: true };
      const characterSvc = makeCharacterService({
        get: vi.fn().mockResolvedValue(asMj),
        setSheetField: vi.fn().mockRejectedValue(new Error('boom')),
      });
      const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
      const comp = fixture.componentInstance as any;

      await comp.submitFieldEdit('fetiqueObject', 'x');
      fixture.detectChanges();

      expect(comp.fieldEditError()).not.toBeNull();
    });

    it('submitXpEdit() appelle setXp, met à jour character()', async () => {
      const updated = { ...CHARACTER, viewerIsMj: true, xp: 500 };
      const asMj = { ...CHARACTER, viewerIsMj: true, xp: 10 };
      const characterSvc = makeCharacterService({
        get: vi.fn().mockResolvedValue(asMj),
        setXp: vi.fn().mockResolvedValue(updated),
      });
      const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
      const comp = fixture.componentInstance as any;

      await comp.submitXpEdit(500);
      fixture.detectChanges();

      expect(characterSvc.setXp).toHaveBeenCalledWith('char1', 500);
      expect(comp.character().xp).toBe(500);
    });

    it('submitXpEdit() erreur réseau → fieldEditError() affiché', async () => {
      const asMj = { ...CHARACTER, viewerIsMj: true };
      const characterSvc = makeCharacterService({
        get: vi.fn().mockResolvedValue(asMj),
        setXp: vi.fn().mockRejectedValue(new Error('boom')),
      });
      const { fixture } = await createComponent(characterSvc, 'char1', null, 'mj-stranger');
      const comp = fixture.componentInstance as any;

      await comp.submitXpEdit(500);
      fixture.detectChanges();

      expect(comp.fieldEditError()).not.toBeNull();
    });
  });
});
