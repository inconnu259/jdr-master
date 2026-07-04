import { TestBed } from '@angular/core/testing';
import { NarrativeStep } from './narrative-step';

describe('NarrativeStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('tous les champs sont optionnels et libres — la saisie émet le champ modifié en préservant les autres', async () => {
    TestBed.configureTestingModule({ imports: [NarrativeStep] });
    const fixture = TestBed.createComponent(NarrativeStep);
    fixture.componentRef.setInput('narrative', { name: 'Fenn' });
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: unknown[] = [];
    fixture.componentInstance.narrativeChange.subscribe((v) => emitted.push(v));

    const motivationInput: HTMLInputElement = fixture.nativeElement.querySelector('#motivation');
    motivationInput.value = 'Voir la mer';
    motivationInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(emitted).toEqual([{ name: 'Fenn', motivation: 'Voir la mer' }]);
  });

  it('le champ Sexe est une liste déroulante (Homme/Femme/Autre)', async () => {
    TestBed.configureTestingModule({ imports: [NarrativeStep] });
    const fixture = TestBed.createComponent(NarrativeStep);
    fixture.detectChanges();
    await fixture.whenStable();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#sex');
    expect(select.tagName).toBe('SELECT');
    const options = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(options).toEqual(['', 'Homme', 'Femme', 'Autre']);
  });

  it('le champ Âge est un input numérique qui refuse les valeurs négatives', async () => {
    TestBed.configureTestingModule({ imports: [NarrativeStep] });
    const fixture = TestBed.createComponent(NarrativeStep);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: unknown[] = [];
    fixture.componentInstance.narrativeChange.subscribe((v) => emitted.push(v));

    const ageInput: HTMLInputElement = fixture.nativeElement.querySelector('#age');
    expect(ageInput.type).toBe('number');

    ageInput.value = '-5';
    ageInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(emitted).toEqual([]);

    ageInput.value = '25';
    ageInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(emitted).toEqual([{ age: '25' }]);
  });
});
