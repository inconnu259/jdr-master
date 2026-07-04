import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { WeaponStep } from './weapon-step';

const WEAPONS: ContentEntryDto[] = [
  { key: 'arc', data: { label: 'Arc', touchFormula: 'AGI+INT-2', damageFormula: 'AGI' } },
  { key: 'lance', data: { label: 'Lance', touchFormula: 'VIG+AGI', damageFormula: 'VIG+1' } },
];

describe('WeaponStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("sélection d'une arme → émet weaponCategoryIdChange et affiche Toucher/Dégâts", async () => {
    TestBed.configureTestingModule({ imports: [WeaponStep] });
    const fixture = TestBed.createComponent(WeaponStep);
    fixture.componentRef.setInput('weapons', WEAPONS);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: string[] = [];
    fixture.componentInstance.weaponCategoryIdChange.subscribe((k: string) => emitted.push(k));

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click();
    expect(emitted).toEqual(['arc']);

    fixture.componentRef.setInput('weaponCategoryId', 'arc');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('AGI+INT-2');
    expect(fixture.nativeElement.textContent).toContain('AGI');
  });

  it('chaque ChoiceCard a un aria-label complet incluant Toucher/Dégâts', async () => {
    TestBed.configureTestingModule({ imports: [WeaponStep] });
    const fixture = TestBed.createComponent(WeaponStep);
    fixture.componentRef.setInput('weapons', WEAPONS);
    fixture.detectChanges();
    await fixture.whenStable();

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].getAttribute('aria-label')).toBe('Arc : Toucher AGI+INT-2, Dégâts AGI');
  });
});
