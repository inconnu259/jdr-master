import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SheetActionsMenu } from './sheet-actions-menu';

function createComponent(showPdfCrop = false) {
  const fixture = TestBed.createComponent(SheetActionsMenu);
  fixture.componentRef.setInput('showPdfCrop', showPdfCrop);
  fixture.detectChanges();
  return fixture;
}

describe('SheetActionsMenu', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("rend les 4 actions d'export sans recadrage PDF par défaut (showPdfCrop absent, AC6)", () => {
    const fixture = createComponent();
    const buttons = fixture.nativeElement.querySelectorAll('.actions-menu__item');
    expect(buttons.length).toBe(4);
  });

  it('rend la 5e action (recadrage PDF) uniquement quand showPdfCrop=true (AC2, AC6)', () => {
    const fixture = createComponent(true);
    const buttons = fixture.nativeElement.querySelectorAll('.actions-menu__item');
    expect(buttons.length).toBe(5);
  });

  it('clic sur "fiche éditable" émet exportEditable', () => {
    const fixture = createComponent();
    const spy = vi.fn();
    fixture.componentInstance.exportEditable.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll(
      '.actions-menu__item',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clic sur "fiche 2 pages" émet export2Pages', () => {
    const fixture = createComponent();
    const spy = vi.fn();
    fixture.componentInstance.export2Pages.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll(
      '.actions-menu__item',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clic sur "équipement" émet exportEquipment', () => {
    const fixture = createComponent();
    const spy = vi.fn();
    fixture.componentInstance.exportEquipment.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll(
      '.actions-menu__item',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[2].click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clic sur "notes" émet exportNotes', () => {
    const fixture = createComponent();
    const spy = vi.fn();
    fixture.componentInstance.exportNotes.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll(
      '.actions-menu__item',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[3].click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clic sur "recadrage PDF" émet cropPdfPortrait (5e action, showPdfCrop=true)', () => {
    const fixture = createComponent(true);
    const spy = vi.fn();
    fixture.componentInstance.cropPdfPortrait.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll(
      '.actions-menu__item',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[4].click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Revue de code 31.1 — si le focus était sur le 5e item au moment où il disparaît (showPdfCrop
  // bascule à false pendant que le menu est ouvert), le focus ne doit pas filer vers <body>.
  it('le focus revient sur le premier item si le focus quitte le menu sans destination (filet de sécurité)', async () => {
    const fixture = createComponent(true);
    document.body.appendChild(fixture.nativeElement);
    const buttons = fixture.nativeElement.querySelectorAll(
      '.actions-menu__item',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[4].focus();
    expect(document.activeElement).toBe(buttons[4]);

    // Simule ce que fait un vrai navigateur quand l'élément focalisé est retiré du DOM : le focus
    // retombe sur <body> avant que le focusout (relatedTarget null) n'atteigne le conteneur.
    buttons[4].blur();
    const container: HTMLElement = fixture.nativeElement.querySelector('.actions-menu');
    container.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.activeElement).toBe(buttons[0]);
    fixture.nativeElement.remove();
  });
});
