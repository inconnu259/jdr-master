import { TestBed } from '@angular/core/testing';
import { FetishStep } from './fetish-step';

describe('FetishStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('champ texte libre → émet fetiqueObjectChange à la saisie', async () => {
    TestBed.configureTestingModule({ imports: [FetishStep] });
    const fixture = TestBed.createComponent(FetishStep);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: string[] = [];
    fixture.componentInstance.fetiqueObjectChange.subscribe((v: string) => emitted.push(v));

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Une plume de corbeau';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(emitted).toEqual(['Une plume de corbeau']);
  });
});
