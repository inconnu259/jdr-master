import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { EquipmentStep } from './equipment-step';

const EQUIPMENT_ITEMS: ContentEntryDto[] = [
  { key: 'rations', data: { label: 'Rations', priceGold: 10, nature: 'individual', weight: 1 } },
  {
    key: 'grand-sac-a-dos',
    data: { label: 'Grand sac à dos', priceGold: 40, nature: 'contenant', weight: 3 },
  },
  { key: 'outre', data: { label: 'Outre', priceGold: 30, nature: 'contenant', weight: 1 } },
  { key: 'couverts', data: { label: 'Couverts', priceGold: 10, nature: 'individual', weight: 1 } },
  {
    key: 'sac-de-couchage',
    data: { label: 'Sac de couchage', priceGold: 50, nature: 'individual', weight: 1 },
  },
  {
    key: 'monture-grande',
    data: { label: 'Monture (grande)', priceGold: 3800, nature: 'animal' },
  },
];

const EQUIPMENT_PACKAGES: ContentEntryDto[] = [
  {
    key: 'necessaire-voyage',
    data: {
      label: 'Nécessaire de voyage',
      priceGold: 150,
      items: [
        { itemKey: 'grand-sac-a-dos', quantity: 1 },
        { itemKey: 'sac-de-couchage', quantity: 1 },
        { itemKey: 'couverts', quantity: 1 },
        { itemKey: 'outre', quantity: 1 },
        { itemKey: 'rations', quantity: 2 },
      ],
    },
  },
];

describe('EquipmentStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    TestBed.configureTestingModule({ imports: [EquipmentStep] });
    const fixture = TestBed.createComponent(EquipmentStep);
    fixture.componentRef.setInput('equipmentItems', EQUIPMENT_ITEMS);
    fixture.componentRef.setInput('equipmentPackages', EQUIPMENT_PACKAGES);
    fixture.detectChanges();
    return fixture;
  }

  it('mode nécessaire pré-fait : affiche le nécessaire résolu (noms réels du catalogue, pas de FIXED_EQUIPMENT)', async () => {
    const fixture = setup();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Nécessaire de voyage');
    expect(text).toContain('Grand sac à dos');
    expect(text).toContain('Sac de couchage');
    expect(text).toContain('Couverts');
    expect(text).toContain('Outre');
    expect(text).toContain('Rations');
  });

  it('cliquer sur "Nécessaire pré-fait" émet la sélection agrégée des 2 nécessaires', async () => {
    const fixture = setup();
    await fixture.whenStable();

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
      '.equipment-step__mode-button',
    );
    buttons[1].click(); // Achat libre d'abord (le mode par défaut est déjà 'kit', sans quoi le clic est un no-op)
    fixture.detectChanges();

    const emitted: { key: string; quantity: number }[][] = [];
    fixture.componentInstance.selectionChange.subscribe((s: { key: string; quantity: number }[]) =>
      emitted.push(s),
    );

    buttons[0].click(); // Nécessaire pré-fait
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(
      expect.arrayContaining([
        { key: 'grand-sac-a-dos', quantity: 1 },
        { key: 'sac-de-couchage', quantity: 1 },
        { key: 'couverts', quantity: 1 },
        { key: 'outre', quantity: 1 },
        { key: 'rations', quantity: 2 },
      ]),
    );
    expect(emitted[0]).toHaveLength(5);
  });

  it('mode achat libre : ajouter un objet incrémente la quantité et le total', async () => {
    const fixture = setup();
    await fixture.whenStable();

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
      '.equipment-step__mode-button',
    );
    buttons[1].click(); // Achat libre
    fixture.detectChanges();

    const emitted: { key: string; quantity: number }[][] = [];
    fixture.componentInstance.selectionChange.subscribe((s: { key: string; quantity: number }[]) =>
      emitted.push(s),
    );

    const addButtons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
      '.equipment-step__catalog-item button',
    );
    addButtons[0].click(); // Rations
    fixture.detectChanges();
    // Composant contrôlé (pas d'état interne) : simule le parent qui refléterait l'émission dans
    // l'input `selection`, sinon le 2e clic repartirait de l'input d'origine ([]).
    fixture.componentRef.setInput('selection', emitted.at(-1));
    fixture.detectChanges();
    addButtons[0].click(); // Rations encore
    fixture.detectChanges();

    expect(emitted).toEqual([[{ key: 'rations', quantity: 1 }], [{ key: 'rations', quantity: 2 }]]);
  });

  it('retirer un objet du panier décrémente la quantité (0 → disparaît de la sélection)', async () => {
    TestBed.configureTestingModule({ imports: [EquipmentStep] });
    const fixture = TestBed.createComponent(EquipmentStep);
    fixture.componentRef.setInput('equipmentItems', EQUIPMENT_ITEMS);
    fixture.componentRef.setInput('equipmentPackages', EQUIPMENT_PACKAGES);
    fixture.componentRef.setInput('selection', [{ key: 'rations', quantity: 1 }]);
    fixture.detectChanges();
    await fixture.whenStable();

    // Resynchronisation : sélection non-kit → mode achat libre affiché automatiquement.
    expect(fixture.nativeElement.querySelector('.equipment-step__cart')).not.toBeNull();

    const emitted: { key: string; quantity: number }[][] = [];
    fixture.componentInstance.selectionChange.subscribe((s: { key: string; quantity: number }[]) =>
      emitted.push(s),
    );

    const removeButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.equipment-step__cart-line button',
    );
    removeButton.click();
    fixture.detectChanges();

    expect(emitted).toEqual([[]]);
  });

  it('le budget affiché reflète le total et signale un dépassement au-delà de 1000 Po', async () => {
    TestBed.configureTestingModule({ imports: [EquipmentStep] });
    const fixture = TestBed.createComponent(EquipmentStep);
    fixture.componentRef.setInput('equipmentItems', EQUIPMENT_ITEMS);
    fixture.componentRef.setInput('equipmentPackages', EQUIPMENT_PACKAGES);
    fixture.componentRef.setInput('selection', [{ key: 'monture-grande', quantity: 1 }]);
    fixture.detectChanges();
    await fixture.whenStable();

    const budget = fixture.nativeElement.querySelector('.equipment-step__budget');
    expect(budget.textContent).toContain('3800');
    expect(budget.classList.contains('equipment-step__budget--over')).toBe(true);
  });

  it('basculer de mode réinitialise la sélection (kit → achat libre)', async () => {
    TestBed.configureTestingModule({ imports: [EquipmentStep] });
    const fixture = TestBed.createComponent(EquipmentStep);
    fixture.componentRef.setInput('equipmentItems', EQUIPMENT_ITEMS);
    fixture.componentRef.setInput('equipmentPackages', EQUIPMENT_PACKAGES);
    fixture.componentRef.setInput('selection', [
      { key: 'grand-sac-a-dos', quantity: 1 },
      { key: 'sac-de-couchage', quantity: 1 },
      { key: 'couverts', quantity: 1 },
      { key: 'outre', quantity: 1 },
      { key: 'rations', quantity: 2 },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: { key: string; quantity: number }[][] = [];
    fixture.componentInstance.selectionChange.subscribe((s: { key: string; quantity: number }[]) =>
      emitted.push(s),
    );

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
      '.equipment-step__mode-button',
    );
    buttons[1].click(); // Achat libre
    fixture.detectChanges();

    expect(emitted).toEqual([[]]);
  });
});
