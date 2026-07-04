import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { AttributesStep } from './attributes-step';

const PATTERN: ContentEntryDto = {
  key: 'polyvalent',
  data: { label: 'Polyvalent', values: [8, 4, 6, 6] },
};

describe('AttributesStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    TestBed.configureTestingModule({ imports: [AttributesStep] });
    const fixture = TestBed.createComponent(AttributesStep);
    fixture.componentRef.setInput('pattern', PATTERN);
    fixture.detectChanges();
    return fixture;
  }

  it("n'émet rien tant que les 4 attributs ne sont pas assignés", async () => {
    const fixture = setup();
    const emitted: unknown[] = [];
    fixture.componentInstance.attributesChange.subscribe((v) => emitted.push(v));

    const rows = fixture.nativeElement.querySelectorAll('.attr-slot');
    // Assigne seulement AGI (première ligne, premier chip = 8)
    (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted).toEqual([null]);
  });

  it('assigne les 4 valeurs (dont les deux 6 distincts) → émet le résultat complet', async () => {
    const fixture = setup();
    const emitted: unknown[] = [];
    fixture.componentInstance.attributesChange.subscribe((v) => emitted.push(v));

    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
    // AGI ← chip index 0 (valeur 8)
    (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click();
    // ESP ← chip index 2 (valeur 6, première occurrence)
    (rows[1].querySelectorAll('.value-chip')[2] as HTMLButtonElement).click();
    // INT ← chip index 3 (valeur 6, seconde occurrence)
    (rows[2].querySelectorAll('.value-chip')[3] as HTMLButtonElement).click();
    // VIG ← chip index 1 (valeur 4)
    (rows[3].querySelectorAll('.value-chip')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const last = emitted.at(-1);
    expect(last).toEqual({ AGI: 8, ESP: 6, INT: 6, VIG: 4 });
  });

  it('une valeur assignée à un attribut ne peut pas être réassignée ailleurs sans être libérée', async () => {
    const fixture = setup();
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');

    // AGI ← chip index 0 (valeur 8)
    (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Le chip index 0 (valeur 8) doit être désactivé dans les AUTRES lignes
    const espChip0 = rows[1].querySelectorAll('.value-chip')[0] as HTMLButtonElement;
    expect(espChip0.disabled).toBe(true);

    // Mais toujours actif (sélectionné) sur sa propre ligne (AGI)
    const agiChip0 = rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement;
    expect(agiChip0.disabled).toBe(false);
    expect(agiChip0.classList.contains('value-chip--selected')).toBe(true);
  });

  it('restaure la sélection visuelle des chips quand `attributes` est déjà renseigné (ex. retour en arrière)', async () => {
    TestBed.configureTestingModule({ imports: [AttributesStep] });
    const fixture = TestBed.createComponent(AttributesStep);
    fixture.componentRef.setInput('pattern', PATTERN);
    // Simule un composant recréé avec des attributs déjà assignés (dont les deux valeurs 6 distinctes).
    fixture.componentRef.setInput('attributes', { AGI: 8, ESP: 6, INT: 6, VIG: 4 });
    fixture.detectChanges();
    await fixture.whenStable();

    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
    expect((rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).classList).toContain(
      'value-chip--selected',
    );
    // ESP et INT doivent chacun avoir un chip "6" sélectionné, sur des index distincts (2 et 3).
    const espSelected = [...rows[1].querySelectorAll('.value-chip')].findIndex((c) =>
      c.classList.contains('value-chip--selected'),
    );
    const intSelected = [...rows[2].querySelectorAll('.value-chip')].findIndex((c) =>
      c.classList.contains('value-chip--selected'),
    );
    expect(espSelected).not.toBe(-1);
    expect(intSelected).not.toBe(-1);
    expect(espSelected).not.toBe(intSelected);
    expect((rows[3].querySelectorAll('.value-chip')[1] as HTMLButtonElement).classList).toContain(
      'value-chip--selected',
    );
  });
});
