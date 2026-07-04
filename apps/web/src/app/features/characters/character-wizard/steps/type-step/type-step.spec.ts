import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { TypeStep } from './type-step';

const TYPES: ContentEntryDto[] = [
  {
    key: 'attaque',
    data: { label: 'Attaque', advantages: [{ name: 'Endurance', effect: '+4 PV' }] },
  },
  {
    key: 'magie',
    data: { label: 'Magie', advantages: [{ name: 'Réserve', effect: '+4 PE' }] },
  },
];

describe('TypeStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sélection d\'un type → émet typeIdChange et affiche les avantages', async () => {
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
