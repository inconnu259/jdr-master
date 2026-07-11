import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FieldEditPencil } from './field-edit-pencil';

async function createComponent(
  value: string | number = 'Lanterne',
  type: 'text' | 'number' = 'text',
) {
  await TestBed.configureTestingModule({
    imports: [FieldEditPencil],
  }).compileComponents();
  const fixture = TestBed.createComponent(FieldEditPencil);
  fixture.componentRef.setInput('label', "l'objet fétiche");
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('type', type);
  fixture.detectChanges();
  return fixture;
}

describe('FieldEditPencil', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche le bouton crayon par défaut avec le bon aria-label', async () => {
    const fixture = await createComponent();

    const pencil = fixture.nativeElement.querySelector(
      '.field-edit-pencil__button',
    ) as HTMLButtonElement;
    expect(pencil).not.toBeNull();
    expect(pencil.getAttribute('aria-label')).toBe("Modifier l'objet fétiche");
    expect(fixture.nativeElement.querySelector('.field-edit-pencil__form')).toBeNull();
  });

  it('clic sur le crayon → passe en mode édition, input pré-rempli avec value()', async () => {
    const fixture = await createComponent('Lanterne');

    (
      fixture.nativeElement.querySelector('.field-edit-pencil__button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      '.field-edit-pencil__input',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Lanterne');
    expect(fixture.nativeElement.querySelector('.field-edit-pencil__button')).toBeNull();
  });

  it('"Valider" émet confirm avec la valeur du draft et repasse en mode lecture', async () => {
    const fixture = await createComponent('Lanterne');
    const emitted: (string | number)[] = [];
    fixture.componentInstance.confirm.subscribe((v) => emitted.push(v));

    (
      fixture.nativeElement.querySelector('.field-edit-pencil__button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '.field-edit-pencil__input',
    ) as HTMLInputElement;
    input.value = 'Lanterne magique';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.field-edit-pencil__confirm') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(emitted).toEqual(['Lanterne magique']);
    expect(fixture.nativeElement.querySelector('.field-edit-pencil__button')).not.toBeNull();
  });

  it('type="number" : "Valider" émet un nombre (cast depuis le draft)', async () => {
    const fixture = await createComponent(4, 'number');
    const emitted: (string | number)[] = [];
    fixture.componentInstance.confirm.subscribe((v) => emitted.push(v));

    (
      fixture.nativeElement.querySelector('.field-edit-pencil__button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '.field-edit-pencil__input',
    ) as HTMLInputElement;
    input.value = '6';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.field-edit-pencil__confirm') as HTMLButtonElement
    ).click();

    expect(emitted).toEqual([6]);
    expect(typeof emitted[0]).toBe('number');
  });

  it('type="number" : vider le champ puis "Valider" ne soumet rien (bloque, ne convertit pas silencieusement en 0 — revue de code)', async () => {
    const fixture = await createComponent(4, 'number');
    const emitted: (string | number)[] = [];
    fixture.componentInstance.confirm.subscribe((v) => emitted.push(v));

    (
      fixture.nativeElement.querySelector('.field-edit-pencil__button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '.field-edit-pencil__input',
    ) as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.field-edit-pencil__confirm') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    // Le formulaire reste ouvert (pas de retour en mode lecture) tant que la valeur est invalide.
    expect(fixture.nativeElement.querySelector('.field-edit-pencil__form')).not.toBeNull();
  });

  it('"Annuler" repasse en mode lecture sans émettre confirm', async () => {
    const fixture = await createComponent('Lanterne');
    const confirmSpy = vi.fn();
    fixture.componentInstance.confirm.subscribe(confirmSpy);

    (
      fixture.nativeElement.querySelector('.field-edit-pencil__button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '.field-edit-pencil__input',
    ) as HTMLInputElement;
    input.value = 'Valeur abandonnée';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.field-edit-pencil__cancel') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.field-edit-pencil__button')).not.toBeNull();

    // Ré-ouverture : le draft doit repartir de value(), pas de la valeur abandonnée.
    (
      fixture.nativeElement.querySelector('.field-edit-pencil__button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const reopenedInput = fixture.nativeElement.querySelector(
      '.field-edit-pencil__input',
    ) as HTMLInputElement;
    expect(reopenedInput.value).toBe('Lanterne');
  });
});
