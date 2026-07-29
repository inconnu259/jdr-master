import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { WeaponStep } from './weapon-step';

const WEAPON_CATEGORIES: ContentEntryDto[] = [
  {
    key: 'arc',
    data: {
      label: 'Arc',
      description: 'Distance, mais difficiles à utiliser. Deux mains.',
      touchFormula: 'AGI+INT-2',
      damageFormula: 'AGI',
    },
  },
  {
    key: 'lance',
    data: {
      label: 'Lance',
      description: 'Armes meurtrières. Deux mains.',
      touchFormula: 'VIG+AGI',
      damageFormula: 'VIG+1',
    },
  },
  {
    key: 'mains-nues',
    data: {
      label: 'Mains nues',
      description: 'Armes de la dernière chance. Deux mains.',
      touchFormula: 'VIG+AGI',
      damageFormula: 'VIG-2',
    },
  },
];

const WEAPON_ITEMS: ContentEntryDto[] = [
  { key: 'arc-de-chasse', data: { label: 'Arc de chasse', categoryId: 'arc' } },
  { key: 'arc-court', data: { label: 'Arc court', categoryId: 'arc' } },
  { key: 'lance', data: { label: 'Lance', categoryId: 'lance' } },
  { key: 'mains-nues', data: { label: 'Mains nues', categoryId: 'mains-nues' } },
];

describe('WeaponStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    TestBed.configureTestingModule({ imports: [WeaponStep] });
    const fixture = TestBed.createComponent(WeaponStep);
    fixture.componentRef.setInput('weaponItems', WEAPON_ITEMS);
    fixture.componentRef.setInput('weaponCategories', WEAPON_CATEGORIES);
    fixture.detectChanges();
    return fixture;
  }

  function grids(fixture: ReturnType<typeof setup>): NodeListOf<HTMLElement> {
    return fixture.nativeElement.querySelectorAll('.weapon-step__grid');
  }

  function categoryButtons(fixture: ReturnType<typeof setup>): HTMLButtonElement[] {
    return Array.from(grids(fixture)[0].querySelectorAll('button'));
  }

  function itemButtons(fixture: ReturnType<typeof setup>): HTMLButtonElement[] {
    return Array.from(grids(fixture)[1]?.querySelectorAll('button') ?? []);
  }

  it("étape 1 : choisir une catégorie affiche sa description et les armes précises de cette catégorie (étape 2)", async () => {
    const fixture = setup();
    await fixture.whenStable();

    categoryButtons(fixture)[0].click(); // Arc
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      'Distance, mais difficiles à utiliser. Deux mains.',
    );
    const items = itemButtons(fixture);
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Arc de chasse');
    expect(items[1].textContent).toContain('Arc court');
  });

  it("étape 2 : choisir une arme précise émet weaponIdChange et affiche Toucher/Dégâts résolus par catégorie", async () => {
    const fixture = setup();
    await fixture.whenStable();

    const emitted: (string | null)[] = [];
    fixture.componentInstance.weaponIdChange.subscribe((k: string | null) => emitted.push(k));

    categoryButtons(fixture)[0].click(); // Arc
    fixture.detectChanges();
    await fixture.whenStable();

    itemButtons(fixture)[0].click(); // Arc de chasse
    expect(emitted).toEqual([null, 'arc-de-chasse']);

    fixture.componentRef.setInput('weaponId', 'arc-de-chasse');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Arc de chasse');
    expect(fixture.nativeElement.textContent).toContain('AGI+INT-2');
  });

  it("choisir Mains nues n'affiche pas d'étape 2 et auto-assigne son unique weaponItem", async () => {
    const fixture = setup();
    await fixture.whenStable();

    const emitted: (string | null)[] = [];
    fixture.componentInstance.weaponIdChange.subscribe((k: string | null) => emitted.push(k));

    categoryButtons(fixture)[2].click(); // Mains nues
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted).toEqual(['mains-nues']);
    expect(fixture.nativeElement.querySelectorAll('.weapon-step__grid').length).toBe(1);
  });

  it('changer de catégorie après avoir choisi une arme précise réinitialise le choix (émet null)', async () => {
    const fixture = setup();
    fixture.componentRef.setInput('weaponId', 'arc-de-chasse');
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: (string | null)[] = [];
    fixture.componentInstance.weaponIdChange.subscribe((k: string | null) => emitted.push(k));

    categoryButtons(fixture)[1].click(); // Lance
    expect(emitted).toEqual([null]);
  });

  it("retour en arrière sur l'étape : reconstruit la catégorie sélectionnée depuis weaponId", async () => {
    // Simule le cas réel (composant recréé par le @switch du conteneur avec weaponId déjà
    // renseigné) : l'input doit être positionné AVANT le premier detectChanges, sinon l'effet de
    // resynchronisation (qui ne s'exécute qu'une fois) se déclenche avec weaponId encore absent.
    TestBed.configureTestingModule({ imports: [WeaponStep] });
    const fixture = TestBed.createComponent(WeaponStep);
    fixture.componentRef.setInput('weaponItems', WEAPON_ITEMS);
    fixture.componentRef.setInput('weaponCategories', WEAPON_CATEGORIES);
    fixture.componentRef.setInput('weaponId', 'lance');
    fixture.detectChanges();
    await fixture.whenStable();

    const items = itemButtons(fixture);
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Lance');
  });

  it('aucune catégorie sélectionnée → aucune étape 2 ni détail affichés', async () => {
    const fixture = setup();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('.weapon-step__grid').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.weapon-step__detail')).toBeNull();
    expect(fixture.nativeElement.querySelector('.weapon-step__category-description')).toBeNull();
  });
});
