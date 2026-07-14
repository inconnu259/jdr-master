import { TestBed } from '@angular/core/testing';
import { FillIndicator } from './fill-indicator';

function setup(count: number, min: number, max: number) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [FillIndicator] });
  const fixture = TestBed.createComponent(FillIndicator);
  fixture.componentRef.setInput('count', count);
  fixture.componentRef.setInput('min', min);
  fixture.componentRef.setInput('max', max);
  fixture.detectChanges();
  return fixture;
}

describe('FillIndicator', () => {
  it('sous le minimum (0 inscrit) → classe --under-min (AC8)', () => {
    const fixture = setup(0, 4, 6);
    const fill: HTMLElement = fixture.nativeElement.querySelector('.fill-indicator__fill');
    expect(fill.classList.contains('fill-indicator__fill--under-min')).toBe(true);
  });

  it('entre min et max → classe --mixed', () => {
    const fixture = setup(5, 4, 6);
    const fill: HTMLElement = fixture.nativeElement.querySelector('.fill-indicator__fill');
    expect(fill.classList.contains('fill-indicator__fill--mixed')).toBe(true);
  });

  it('au maximum → classe --at-max', () => {
    const fixture = setup(6, 4, 6);
    const fill: HTMLElement = fixture.nativeElement.querySelector('.fill-indicator__fill');
    expect(fill.classList.contains('fill-indicator__fill--at-max')).toBe(true);
  });

  it('au-delà du maximum (edge case défensif) → reste classé --at-max, pas de 5e état', () => {
    const fixture = setup(7, 4, 6);
    const fill: HTMLElement = fixture.nativeElement.querySelector('.fill-indicator__fill');
    expect(fill.classList.contains('fill-indicator__fill--at-max')).toBe(true);
  });

  it('la valeur numérique est toujours affichée en texte, quel que soit l’état (AC7, accessibilité)', () => {
    for (const [count, min, max] of [
      [0, 4, 6],
      [5, 4, 6],
      [6, 4, 6],
    ] as const) {
      const fixture = setup(count, min, max);
      expect(fixture.nativeElement.textContent).toContain(
        `${count} / ${max} inscrits (min. ${min})`,
      );
    }
  });
});
