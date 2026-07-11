import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { InventoryTab } from './inventory-tab';
import { CharacterService } from '../../../../core/characters/character.service';
import { makeCharacterDto } from '../../../../core/characters/character-dto.fixture';

function makeCharacterWithItems(
  items: { id: string; name: string; weight: number; addedBy: string }[],
) {
  return makeCharacterDto({
    sheetData: { equipment: { individual: items, group: [] } },
    derived: { PV: 16, PE: 12, Condition: 14, Initiative: 10, Encombrement: 9 },
  });
}

async function createComponent(characterSvc: Partial<CharacterService>, isOwner = true) {
  await TestBed.configureTestingModule({
    imports: [InventoryTab],
    providers: [{ provide: CharacterService, useValue: characterSvc }],
  }).compileComponents();
  const fixture = TestBed.createComponent(InventoryTab);
  fixture.componentRef.setInput('character', makeCharacterWithItems([]));
  fixture.componentRef.setInput('isOwner', isOwner);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('InventoryTab', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('rend la liste + EncumbranceBar avec le bon total', async () => {
    const characterSvc = { addInventoryItem: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [InventoryTab],
      providers: [{ provide: CharacterService, useValue: characterSvc }],
    }).compileComponents();
    const fixture = TestBed.createComponent(InventoryTab);
    fixture.componentRef.setInput(
      'character',
      makeCharacterWithItems([
        { id: 'item-1', name: 'Cape', weight: 1.2, addedBy: 'player' },
        { id: 'item-2', name: 'Sac', weight: 3, addedBy: 'player' },
      ]),
    );
    fixture.componentRef.setInput('isOwner', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Cape');
    expect(el.textContent).toContain('Sac');
    expect(el.textContent).toContain('4.2'); // 1.2 + 3
  });

  it('formulaire d’ajout absent si isOwner=false', async () => {
    const fixture = await createComponent({ addInventoryItem: vi.fn() }, false);
    expect(fixture.nativeElement.querySelector('.inventory-tab__add-form')).toBeNull();
  });

  it('ajout appelle characterSvc.addInventoryItem avec le payload attendu et émet characterUpdated', async () => {
    const updated = makeCharacterWithItems([
      { id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' },
    ]);
    const characterSvc = { addInventoryItem: vi.fn().mockResolvedValue(updated) };
    const fixture = await createComponent(characterSvc);
    const comp = fixture.componentInstance as any;

    let emitted: unknown = null;
    comp.characterUpdated.subscribe((c: unknown) => (emitted = c));

    comp.newItemName.set('Cape');
    comp.newItemWeight.set(1);
    await comp.submitAdd();

    expect(characterSvc.addInventoryItem).toHaveBeenCalledWith('char1', {
      name: 'Cape',
      weight: 1,
    });
    expect(emitted).toEqual(updated);
  });

  it('édition appelle updateInventoryItem avec le bon itemId (pas un index)', async () => {
    const updated = makeCharacterWithItems([
      { id: 'item-2', name: 'Cape usée', weight: 1, addedBy: 'player' },
    ]);
    const characterSvc = { updateInventoryItem: vi.fn().mockResolvedValue(updated) };
    await TestBed.configureTestingModule({
      imports: [InventoryTab],
      providers: [{ provide: CharacterService, useValue: characterSvc }],
    }).compileComponents();
    const fixture = TestBed.createComponent(InventoryTab);
    fixture.componentRef.setInput(
      'character',
      makeCharacterWithItems([
        { id: 'item-1', name: 'Sac', weight: 3, addedBy: 'player' },
        { id: 'item-2', name: 'Cape', weight: 1, addedBy: 'player' },
      ]),
    );
    fixture.componentRef.setInput('isOwner', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const comp = fixture.componentInstance as any;

    // Édite le 2e objet (id 'item-2') — prouve que l'adressage se fait par id, pas par position.
    comp.startEdit({ id: 'item-2', name: 'Cape', weight: 1, addedBy: 'player' });
    comp.editName.set('Cape usée');
    await comp.submitEdit('item-2');

    expect(characterSvc.updateInventoryItem).toHaveBeenCalledWith('char1', 'item-2', {
      name: 'Cape usée',
      weight: 1,
    });
  });

  it('vider le champ poids en édition (NaN) remet le poids à 0, ne conserve pas l’ancien poids (régression revue de code)', async () => {
    const updated = makeCharacterWithItems([
      { id: 'item-1', name: 'Cape', weight: 0, addedBy: 'player' },
    ]);
    const characterSvc = { updateInventoryItem: vi.fn().mockResolvedValue(updated) };
    await TestBed.configureTestingModule({
      imports: [InventoryTab],
      providers: [{ provide: CharacterService, useValue: characterSvc }],
    }).compileComponents();
    const fixture = TestBed.createComponent(InventoryTab);
    fixture.componentRef.setInput(
      'character',
      makeCharacterWithItems([{ id: 'item-1', name: 'Cape', weight: 2, addedBy: 'player' }]),
    );
    fixture.componentRef.setInput('isOwner', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const comp = fixture.componentInstance as any;

    comp.startEdit({ id: 'item-1', name: 'Cape', weight: 2, addedBy: 'player' });
    comp.onEditWeightInput(NaN); // simule un <input type="number"> vidé par l'utilisateur
    await comp.submitEdit('item-1');

    expect(characterSvc.updateInventoryItem).toHaveBeenCalledWith('char1', 'item-1', {
      name: 'Cape',
      weight: 0,
    });
  });

  it('suppression appelle removeInventoryItem avec l’itemId', async () => {
    const updated = makeCharacterWithItems([]);
    const characterSvc = { removeInventoryItem: vi.fn().mockResolvedValue(updated) };
    await TestBed.configureTestingModule({
      imports: [InventoryTab],
      providers: [{ provide: CharacterService, useValue: characterSvc }],
    }).compileComponents();
    const fixture = TestBed.createComponent(InventoryTab);
    fixture.componentRef.setInput(
      'character',
      makeCharacterWithItems([{ id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' }]),
    );
    fixture.componentRef.setInput('isOwner', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const comp = fixture.componentInstance as any;

    await comp.removeItem('item-1');

    expect(characterSvc.removeInventoryItem).toHaveBeenCalledWith('char1', 'item-1');
  });

  it('erreur réseau à l’ajout affiche le message inline', async () => {
    const characterSvc = { addInventoryItem: vi.fn().mockRejectedValue(new Error('boom')) };
    const fixture = await createComponent(characterSvc);
    const comp = fixture.componentInstance as any;

    comp.newItemName.set('Cape');
    await comp.submitAdd();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "L'inventaire n'a pas pu être mis à jour. Réessayez.",
    );
  });

  it('empty state si aucun objet', async () => {
    const fixture = await createComponent({ addInventoryItem: vi.fn() });
    expect(fixture.nativeElement.querySelector('.inventory-tab__empty')).not.toBeNull();
  });

  describe('édition MJ (Story 6.6)', () => {
    async function createMjComponent(
      characterSvc: Partial<CharacterService>,
      items: { id: string; name: string; weight: number; addedBy: string }[] = [
        { id: 'item-1', name: 'Corde', weight: 1, addedBy: 'player' },
      ],
    ) {
      await TestBed.configureTestingModule({
        imports: [InventoryTab],
        providers: [{ provide: CharacterService, useValue: characterSvc }],
      }).compileComponents();
      const fixture = TestBed.createComponent(InventoryTab);
      fixture.componentRef.setInput('character', makeCharacterWithItems(items));
      fixture.componentRef.setInput('isOwner', false);
      fixture.componentRef.setInput('viewerIsMj', true);
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture;
    }

    it('MJ (viewerIsMj:true, isOwner:false) → pencil "Modifier" visible, "Supprimer" absent', async () => {
      const fixture = await createMjComponent({});

      expect(
        fixture.nativeElement.querySelectorAll(
          '.inventory-item-row button[aria-label="Modifier l\'objet"]',
        ).length,
      ).toBe(1);
      expect(
        fixture.nativeElement.querySelector('button[aria-label="Supprimer l\'objet"]'),
      ).toBeNull();
    });

    it('MJ → formulaire d’ajout MJ visible', async () => {
      const fixture = await createMjComponent({});
      expect(fixture.nativeElement.querySelector('.inventory-tab__mj-add-form')).not.toBeNull();
    });

    it('submitMjEdit() appelle setSheetField avec equipment.individual.<index correct>', async () => {
      const updated = makeCharacterWithItems([]);
      const characterSvc = {
        setSheetField: vi.fn().mockResolvedValue({ character: updated, warnings: [] }),
      };
      const fixture = await createMjComponent(characterSvc, [
        { id: 'item-1', name: 'Corde', weight: 1, addedBy: 'player' },
        { id: 'item-2', name: 'Sac', weight: 2, addedBy: 'player' },
      ]);
      const comp = fixture.componentInstance as any;

      comp.startEdit({ id: 'item-2', name: 'Sac', weight: 2, addedBy: 'player' });
      comp.editName.set('Sac renforcé');
      await comp.submitMjEdit('item-2');

      expect(characterSvc.setSheetField).toHaveBeenCalledWith('char1', 'equipment.individual.1', {
        name: 'Sac renforcé',
        weight: 2,
        id: 'item-2',
      });
    });

    it('submitMjAdd() appelle setSheetField avec equipment.individual.<longueur actuelle>', async () => {
      const updated = makeCharacterWithItems([]);
      const characterSvc = {
        setSheetField: vi.fn().mockResolvedValue({ character: updated, warnings: [] }),
      };
      const fixture = await createMjComponent(characterSvc, [
        { id: 'item-1', name: 'Corde', weight: 1, addedBy: 'player' },
      ]);
      const comp = fixture.componentInstance as any;

      comp.newItemName.set('Lettre scellée');
      comp.newItemWeight.set(0.1);
      await comp.submitMjAdd();

      expect(characterSvc.setSheetField).toHaveBeenCalledWith('char1', 'equipment.individual.1', {
        name: 'Lettre scellée',
        weight: 0.1,
      });
    });

    it('propriétaire (isOwner:true, viewerIsMj:false) → comportement inchangé, submitEdit/submitAdd toujours appelés (pas setSheetField)', async () => {
      const updated = makeCharacterWithItems([]);
      const characterSvc = {
        addInventoryItem: vi.fn().mockResolvedValue(updated),
        setSheetField: vi.fn(),
      };
      const fixture = await createComponent(characterSvc, true);
      const comp = fixture.componentInstance as any;

      comp.newItemName.set('Cape');
      await comp.submitAdd();

      expect(characterSvc.addInventoryItem).toHaveBeenCalled();
      expect(characterSvc.setSheetField).not.toHaveBeenCalled();
      expect(
        fixture.nativeElement.querySelectorAll(
          '.inventory-item-row button[aria-label="Supprimer l\'objet"]',
        ).length,
      ).toBe(0); // liste vide dans ce test — juste vérifie qu'aucune erreur de rendu MJ n'apparaît
      expect(fixture.nativeElement.querySelector('.inventory-tab__mj-add-form')).toBeNull();
    });
  });
});
