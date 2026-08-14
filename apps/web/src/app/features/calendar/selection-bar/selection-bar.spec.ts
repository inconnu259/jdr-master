import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { SelectionBar } from './selection-bar';

describe('SelectionBar', () => {
  let fixture: ComponentFixture<SelectionBar>;
  let el: HTMLElement;

  function create(count: number, rangeLabel: string | null = null): void {
    fixture = TestBed.createComponent(SelectionBar);
    fixture.componentRef.setInput('count', count);
    fixture.componentRef.setInput('rangeLabel', rangeLabel);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SelectionBar] });
  });

  it('affiche le nombre de créneaux sélectionnés', () => {
    create(4, 'mar. → ven., soirée');
    expect(el.textContent).toContain('4 créneaux');
    expect(el.textContent).toContain('mar. → ven., soirée');
  });

  it('un seul créneau → singulier', () => {
    create(1);
    expect(el.textContent).toContain('1 créneau');
    expect(el.textContent).not.toContain('1 créneaux');
  });

  it('clic sur Disponible émet markAvailable', () => {
    create(2);
    const spy = vi.fn();
    fixture.componentInstance.markAvailable.subscribe(spy);
    const btn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Disponible'),
    )!;
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clic sur Indisponible émet markUnavailable', () => {
    create(2);
    const spy = vi.fn();
    fixture.componentInstance.markUnavailable.subscribe(spy);
    const btn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Indisponible',
    )!;
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clic sur Annuler émet cancelled', () => {
    create(2);
    const spy = vi.fn();
    fixture.componentInstance.cancelled.subscribe(spy);
    const btn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Annuler'),
    )!;
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
