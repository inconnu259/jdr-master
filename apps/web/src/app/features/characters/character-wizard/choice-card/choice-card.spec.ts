import { TestBed } from '@angular/core/testing';
import { ChoiceCard } from './choice-card';

describe('ChoiceCard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC7 — affiche le label ET le sous-titre visible, relié par aria-describedby', async () => {
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
    const detail: HTMLElement = fixture.nativeElement.querySelector('.choice-card__detail');
    expect(detail.textContent).toContain('Pistage, Camouflage, Piège');
    expect(button.getAttribute('aria-describedby')).toBe(detail.id);
    // Le nom accessible est le label seul : le sous-titre visible ne doit pas être dupliqué dedans.
    expect(button.getAttribute('aria-label')).toBe('Chasseur');
  });

  it('AC7 — pas de texte ⇒ pas de ligne : aucun sous-titre, aucun aria-describedby', async () => {
    TestBed.configureTestingModule({ imports: [ChoiceCard] });
    const fixture = TestBed.createComponent(ChoiceCard);
    fixture.componentRef.setInput('option', { key: 'printemps', label: 'Printemps', detail: '  ' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.choice-card__detail')).toBeNull();
    expect(fixture.nativeElement.querySelector('button').hasAttribute('aria-describedby')).toBe(
      false,
    );
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
    expect(button.getAttribute('aria-checked')).toBe('true');
  });

  it('expose la sémantique role="radio" (groupe à choix unique, cf. RadioGroupNavDirective)', async () => {
    TestBed.configureTestingModule({ imports: [ChoiceCard] });
    const fixture = TestBed.createComponent(ChoiceCard);
    fixture.componentRef.setInput('option', { key: 'chasseur', label: 'Chasseur' });
    fixture.detectChanges();
    await fixture.whenStable();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('role')).toBe('radio');
    expect(button.getAttribute('aria-checked')).toBe('false');
  });

  it('carte DÉPLOYÉE : pas de sous-titre, l’indication remplace, et le nom accessible reste le libellé', async () => {
    TestBed.configureTestingModule({ imports: [ChoiceCard] });
    const fixture = TestBed.createComponent(ChoiceCard);
    fixture.componentRef.setInput('option', {
      key: 'chasseur',
      label: 'Chasseur',
      detail: 'Une phrase.',
    });
    fixture.componentRef.setInput('selected', true);
    fixture.componentRef.setInput('expanded', true);
    fixture.componentRef.setInput('expandedHint', 'Toucher pour désélectionner');
    fixture.detectChanges();
    await fixture.whenStable();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.classList).toContain('choice-card--expanded');
    expect(fixture.nativeElement.querySelector('.choice-card__detail')).toBeNull();
    expect(fixture.nativeElement.querySelector('.choice-card__hint').textContent).toContain(
      'Toucher pour désélectionner',
    );
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Chasseur');
  });
});
