import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { AttributesStep } from './attributes-step';

const PATTERNS: ContentEntryDto[] = [
  { key: 'equilibre', data: { label: 'Équilibré', values: [6, 6, 6, 6] } },
  { key: 'polyvalent', data: { label: 'Polyvalent', values: [8, 4, 6, 6] } },
  { key: 'specialiste', data: { label: 'Spécialiste', values: [4, 4, 8, 8] } },
];

describe('AttributesStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    TestBed.configureTestingModule({ imports: [AttributesStep] });
    const fixture = TestBed.createComponent(AttributesStep);
    fixture.componentRef.setInput('patterns', PATTERNS);
    fixture.detectChanges();
    return fixture;
  }

  function selectPolyvalent(fixture: ReturnType<typeof setup>) {
    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
      '.attributes-step__patterns button',
    );
    buttons[1].click(); // polyvalent
    fixture.detectChanges();
  }

  describe('Story 24.1 : choix du profil', () => {
    it('aucune grille de chips tant qu’aucun profil n’est sélectionné', async () => {
      const fixture = setup();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.attributes-step__grid')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Équilibré');
      expect(fixture.nativeElement.textContent).toContain('Polyvalent');
      expect(fixture.nativeElement.textContent).toContain('Spécialiste');
    });

    it('sélection d’un profil → affiche ses valeurs et la grille de chips', async () => {
      const fixture = setup();
      await fixture.whenStable();

      selectPolyvalent(fixture);
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.attributes-step__grid')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('8, 4, 6, 6');
    });

    it('changer de profil après une assignation partielle réinitialise l’assignation et réémet null', async () => {
      const fixture = setup();
      const emitted: unknown[] = [];
      fixture.componentInstance.attributesChange.subscribe((v) => emitted.push(v));
      await fixture.whenStable();

      selectPolyvalent(fixture);
      await fixture.whenStable();
      const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
      (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click(); // AGI ← 8
      fixture.detectChanges();
      await fixture.whenStable();

      const patternButtons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
        '.attributes-step__patterns button',
      );
      patternButtons[2].click(); // specialiste
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.textContent).toContain('4, 4, 8, 8');
      const newRows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
      expect(
        [...newRows[0].querySelectorAll('.value-chip')].some((c) =>
          c.classList.contains('value-chip--selected'),
        ),
      ).toBe(false);
      expect(emitted.at(-1)).toBeNull();
    });

    it('revue de code (2026-07-26) : changer de profil après une assignation COMPLÈTE (4/4) réinitialise aussi l’assignation et réémet null', async () => {
      const fixture = setup();
      const emitted: unknown[] = [];
      fixture.componentInstance.attributesChange.subscribe((v) => emitted.push(v));
      await fixture.whenStable();

      selectPolyvalent(fixture);
      await fixture.whenStable();
      const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
      // Assigne les 4 attributs (Polyvalent [8,4,6,6]).
      (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click(); // AGI ← 8
      (rows[1].querySelectorAll('.value-chip')[2] as HTMLButtonElement).click(); // ESP ← 6
      (rows[2].querySelectorAll('.value-chip')[3] as HTMLButtonElement).click(); // INT ← 6
      (rows[3].querySelectorAll('.value-chip')[1] as HTMLButtonElement).click(); // VIG ← 4
      fixture.detectChanges();
      await fixture.whenStable();
      expect(emitted.at(-1)).toEqual({ AGI: 8, ESP: 6, INT: 6, VIG: 4 });

      const patternButtons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
        '.attributes-step__patterns button',
      );
      patternButtons[0].click(); // equilibre
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.textContent).toContain('6, 6, 6, 6');
      const newRows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
      for (const row of Array.from(newRows)) {
        expect(
          [...row.querySelectorAll('.value-chip')].some((c) =>
            c.classList.contains('value-chip--selected'),
          ),
        ).toBe(false);
      }
      expect(emitted.at(-1)).toBeNull();
    });

    it('recliquer sur le profil déjà sélectionné ne réinitialise PAS l’assignation en cours', async () => {
      const fixture = setup();
      await fixture.whenStable();
      selectPolyvalent(fixture);
      await fixture.whenStable();

      const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
      (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click(); // AGI ← 8
      fixture.detectChanges();
      await fixture.whenStable();

      selectPolyvalent(fixture); // reclic sur le même profil
      await fixture.whenStable();

      expect(
        (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).classList,
      ).toContain('value-chip--selected');
    });

    it('assigne les 4 valeurs du profil Spécialiste (dont les deux 4 et deux 8 distincts) → émet le résultat complet', async () => {
      const fixture = setup();
      const emitted: unknown[] = [];
      fixture.componentInstance.attributesChange.subscribe((v) => emitted.push(v));
      await fixture.whenStable();

      const patternButtons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll(
        '.attributes-step__patterns button',
      );
      patternButtons[2].click(); // specialiste [4,4,8,8]
      fixture.detectChanges();
      await fixture.whenStable();

      const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
      (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).click(); // AGI ← 4 (index 0)
      (rows[1].querySelectorAll('.value-chip')[1] as HTMLButtonElement).click(); // ESP ← 4 (index 1)
      (rows[2].querySelectorAll('.value-chip')[2] as HTMLButtonElement).click(); // INT ← 8 (index 2)
      (rows[3].querySelectorAll('.value-chip')[3] as HTMLButtonElement).click(); // VIG ← 8 (index 3)
      fixture.detectChanges();
      await fixture.whenStable();

      expect(emitted.at(-1)).toEqual({ AGI: 4, ESP: 4, INT: 8, VIG: 8 });
    });

    it('restaure le profil ET l’assignation quand `attributes` correspond à un profil connu (retour en arrière)', async () => {
      TestBed.configureTestingModule({ imports: [AttributesStep] });
      const fixture = TestBed.createComponent(AttributesStep);
      fixture.componentRef.setInput('patterns', PATTERNS);
      // Correspond au profil Spécialiste [4,4,8,8].
      fixture.componentRef.setInput('attributes', { AGI: 4, ESP: 4, INT: 8, VIG: 8 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.textContent).toContain('Patron choisi');
      expect(fixture.nativeElement.textContent).toContain('Spécialiste');
      const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.attr-slot');
      expect(
        (rows[0].querySelectorAll('.value-chip')[0] as HTMLButtonElement).classList,
      ).toContain('value-chip--selected');
      expect(
        (rows[3].querySelectorAll('.value-chip')[3] as HTMLButtonElement).classList,
      ).toContain('value-chip--selected');
    });

    it('aucun profil ne correspond aux valeurs entrantes (donnée legacy/incohérente) → aucun profil pré-sélectionné, pas de crash', async () => {
      TestBed.configureTestingModule({ imports: [AttributesStep] });
      const fixture = TestBed.createComponent(AttributesStep);
      fixture.componentRef.setInput('patterns', PATTERNS);
      fixture.componentRef.setInput('attributes', { AGI: 12, ESP: 4, INT: 4, VIG: 4 });
      expect(() => fixture.detectChanges()).not.toThrow();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.attributes-step__grid')).toBeNull();
    });
  });

  describe('assignation des chips (une fois un profil sélectionné)', () => {
    it("n'émet rien tant que les 4 attributs ne sont pas assignés", async () => {
      const fixture = setup();
      await fixture.whenStable();
      selectPolyvalent(fixture);
      await fixture.whenStable();

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
      await fixture.whenStable();
      selectPolyvalent(fixture);
      await fixture.whenStable();

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
      await fixture.whenStable();
      selectPolyvalent(fixture);
      await fixture.whenStable();
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
      await fixture.whenStable();
      selectPolyvalent(fixture);
      await fixture.whenStable();

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
      await fixture.whenStable();
      selectPolyvalent(fixture);
      await fixture.whenStable();
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
      // Le profil reste sélectionné localement (seule l'assignation change, pas `attributes()`).
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
  });
});
