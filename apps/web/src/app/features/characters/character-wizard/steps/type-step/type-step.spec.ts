import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { TypeStep } from './type-step';

const TYPES: ContentEntryDto[] = [
  {
    key: 'attaque',
    data: {
      label: 'Attaque',
      description: 'Le personnage est très résistant et excelle en combat.',
      advantages: [{ name: 'Endurance', effect: '+4 PV' }],
    },
  },
  {
    key: 'magie',
    data: {
      label: 'Magie',
      description: "Le personnage peut à tout moment réaliser l'impossible.",
      advantages: [{ name: 'Volonté', effect: '+4 PE' }],
    },
  },
  {
    key: 'technique',
    data: {
      label: 'Technique',
      description: "Le personnage est capable d'analyser rapidement une situation.",
      advantages: [
        { name: 'Vitesse', effect: "+1 à l'initiative" },
        { name: 'Bagages', effect: "+3 à la limite d'encombrement" },
      ],
    },
  },
];

describe('TypeStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("sélection d'un type → émet typeIdChange et affiche les avantages", async () => {
    TestBed.configureTestingModule({ imports: [TypeStep] });
    const fixture = TestBed.createComponent(TypeStep);
    fixture.componentRef.setInput('types', TYPES);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: string[] = [];
    fixture.componentInstance.typeIdChange.subscribe((k: string) => emitted.push(k));

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click();
    expect(emitted).toEqual(['attaque']);

    fixture.componentRef.setInput('typeId', 'attaque');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Endurance');
    expect(fixture.nativeElement.textContent).toContain(
      'Le personnage est très résistant et excelle en combat.',
    );
  });

  it('sélection Technique → affiche les avantages corrigés (Vitesse/Bagages)', async () => {
    TestBed.configureTestingModule({ imports: [TypeStep] });
    const fixture = TestBed.createComponent(TypeStep);
    fixture.componentRef.setInput('types', TYPES);
    fixture.componentRef.setInput('typeId', 'technique');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Vitesse');
    expect(fixture.nativeElement.textContent).toContain('Bagages');
  });

  it("aucun avantage de type n'affiche de description propre (AC5 — jamais de texte inventé)", async () => {
    TestBed.configureTestingModule({ imports: [TypeStep] });
    const fixture = TestBed.createComponent(TypeStep);
    fixture.componentRef.setInput('types', TYPES);
    fixture.componentRef.setInput('typeId', 'attaque');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.type-step__advantage-description')).toBeNull();
  });

  it('sélection Magie → affiche la notice différée', async () => {
    TestBed.configureTestingModule({ imports: [TypeStep] });
    const fixture = TestBed.createComponent(TypeStep);
    fixture.componentRef.setInput('types', TYPES);
    fixture.componentRef.setInput('typeId', 'magie');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.type-step__magic-notice')).toBeTruthy();
  });

  it('type non-Magie → pas de notice', async () => {
    TestBed.configureTestingModule({ imports: [TypeStep] });
    const fixture = TestBed.createComponent(TypeStep);
    fixture.componentRef.setInput('types', TYPES);
    fixture.componentRef.setInput('typeId', 'attaque');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.type-step__magic-notice')).toBeNull();
  });
});
