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

  it('recliquer sur le chip déjà sélectionné le désélectionne (toggle) et libère la valeur pour les autres attributs', async () => {
    const fixture = setup();
    const emitted: unknown[] = [];
    fixture.componentInstance.attributesChange.subscribe((v) => emitted.push(v));
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');

    // AGI ← chip index 0 (valeur 8) : les autres lignes se grisent sur cet index.
    const agiChip0 = rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement;
    agiChip0.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(agiChip0.classList.contains('value-chip--selected')).toBe(true);
    expect((rows[1].querySelectorAll('.value-chip')[0] as HTMLButtonElement).disabled).toBe(true);

    // Reclic sur AGI ← chip index 0 : désélection, redevient libre partout, next redevient invalide.
    agiChip0.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(agiChip0.classList.contains('value-chip--selected')).toBe(false);
    expect((rows[1].querySelectorAll('.value-chip')[0] as HTMLButtonElement).disabled).toBe(false);
    expect(emitted.at(-1)).toBeNull();
  });

  it('désélectionner un chip alors que les 4 attributs sont assignés ne désélectionne QUE cet attribut, pas les 3 autres (même une fois le echo `attributes=undefined` du parent reçu en entrée)', async () => {
    const fixture = setup();
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');

    // Assigne les 4 attributs.
    (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click(); // AGI ← 8
    (rows[1].querySelectorAll('.value-chip')[2] as HTMLButtonElement).click(); // ESP ← 6
    (rows[2].querySelectorAll('.value-chip')[3] as HTMLButtonElement).click(); // INT ← 6
    (rows[3].querySelectorAll('.value-chip')[1] as HTMLButtonElement).click(); // VIG ← 4
    fixture.detectChanges();
    await fixture.whenStable();

    // Désélectionne AGI seul.
    (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Le parent réel réagit à l'émission `null` en repassant `attributes` à `undefined` en entrée
    // (cf. character-wizard.ts `sheetData.update(... attributes: attrs ?? undefined)`) — simulé ici.
    fixture.componentRef.setInput('attributes', undefined);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).classList,
    ).not.toContain('value-chip--selected');
    // ESP, INT et VIG doivent RESTER sélectionnés — seul AGI a été désélectionné.
    expect(
      [...rows[1].querySelectorAll('.value-chip')].some((c) =>
        c.classList.contains('value-chip--selected'),
      ),
    ).toBe(true);
    expect(
      [...rows[2].querySelectorAll('.value-chip')].some((c) =>
        c.classList.contains('value-chip--selected'),
      ),
    ).toBe(true);
    expect((rows[3].querySelectorAll('.value-chip')[1] as HTMLButtonElement).classList).toContain(
      'value-chip--selected',
    );
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
