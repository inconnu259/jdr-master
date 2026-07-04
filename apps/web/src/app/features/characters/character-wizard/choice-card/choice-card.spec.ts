import { TestBed } from '@angular/core/testing';
import { ChoiceCard } from './choice-card';

describe('ChoiceCard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche le label et un aria-label combinant label + detail', async () => {
    TestBed.configureTestingModule({ imports: [ChoiceCard] });
    const fixture = TestBed.createComponent(ChoiceCard);
    fixture.componentRef.setInput('option', {
      key: 'chasseur',
      label: 'Chasseur',
      detail: 'Pistage, Camouflage, Piège',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.textContent).toContain('Chasseur');
    expect(button.getAttribute('aria-label')).toBe('Chasseur : Pistage, Camouflage, Piège');
  });

  it('émet selectedOption avec la clé au clic', async () => {
    TestBed.configureTestingModule({ imports: [ChoiceCard] });
    const fixture = TestBed.createComponent(ChoiceCard);
    fixture.componentRef.setInput('option', { key: 'chasseur', label: 'Chasseur' });
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: string[] = [];
    fixture.componentInstance.selectedOption.subscribe((key: string) => emitted.push(key));

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();

    expect(emitted).toEqual(['chasseur']);
  });

  it('applique la classe --selected quand selected=true', async () => {
    TestBed.configureTestingModule({ imports: [ChoiceCard] });
    const fixture = TestBed.createComponent(ChoiceCard);
    fixture.componentRef.setInput('option', { key: 'chasseur', label: 'Chasseur' });
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('choice-card--selected')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
