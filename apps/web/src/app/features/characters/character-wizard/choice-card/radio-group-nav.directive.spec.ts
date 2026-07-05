import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RadioGroupNavDirective } from './radio-group-nav.directive';

@Component({
  standalone: true,
  imports: [RadioGroupNavDirective],
  template: `
    <div role="radiogroup" appRadioGroupNav>
      <button role="radio" aria-checked="false">A</button>
      <button role="radio" aria-checked="false">B</button>
      <button role="radio" aria-checked="false">C</button>
    </div>
  `,
})
class HostComponent {}

describe('RadioGroupNavDirective', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    return { fixture, buttons };
  }

  it('ArrowRight/ArrowDown déplace le focus vers le radio suivant et le sélectionne (clic)', () => {
    const { fixture, buttons } = setup();
    buttons[0].focus();
    const clickSpy = vi.spyOn(buttons[1], 'click');

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(buttons[1]);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('ArrowLeft/ArrowUp déplace le focus vers le radio précédent', () => {
    const { buttons } = setup();
    buttons[1].focus();

    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(document.activeElement).toBe(buttons[0]);
  });

  it('boucle du dernier au premier élément (ArrowRight sur le dernier)', () => {
    const { buttons } = setup();
    buttons[2].focus();

    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(document.activeElement).toBe(buttons[0]);
  });

  it('boucle du premier au dernier élément (ArrowLeft sur le premier)', () => {
    const { buttons } = setup();
    buttons[0].focus();

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(document.activeElement).toBe(buttons[2]);
  });

  it('ignore les autres touches (ex: Enter)', () => {
    const { buttons } = setup();
    buttons[0].focus();

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.activeElement).toBe(buttons[0]);
  });
});
