import { TestBed } from '@angular/core/testing';
import { EncumbranceBar } from './encumbrance-bar';

describe('EncumbranceBar', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('poids sous la limite → label correct, pas de classe over-limit, pas de texte "Surchargé"', async () => {
    TestBed.configureTestingModule({ imports: [EncumbranceBar] });
    const fixture = TestBed.createComponent(EncumbranceBar);
    fixture.componentRef.setInput('totalWeight', 5);
    fixture.componentRef.setInput('limit', 9);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('5');
    expect(el.textContent).toContain('9');
    expect(el.querySelector('.encumbrance-bar--over')).toBeNull();
    expect(el.textContent).not.toContain('Surchargé');
  });

  it('poids au-dessus de la limite → classe over-limit + texte "Surchargé" présent', async () => {
    TestBed.configureTestingModule({ imports: [EncumbranceBar] });
    const fixture = TestBed.createComponent(EncumbranceBar);
    fixture.componentRef.setInput('totalWeight', 12);
    fixture.componentRef.setInput('limit', 9);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.encumbrance-bar--over')).not.toBeNull();
    expect(el.textContent).toContain('Surchargé');
  });

  it('poids exactement égal à la limite → pas surchargé (strictement supérieur requis)', async () => {
    TestBed.configureTestingModule({ imports: [EncumbranceBar] });
    const fixture = TestBed.createComponent(EncumbranceBar);
    fixture.componentRef.setInput('totalWeight', 9);
    fixture.componentRef.setInput('limit', 9);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.encumbrance-bar--over')).toBeNull();
  });
});
