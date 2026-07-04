import { TestBed } from '@angular/core/testing';
import { EquipmentStep, FIXED_EQUIPMENT } from './equipment-step';

describe('EquipmentStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche la liste fixe (nécessaire de voyage + intendance) sans interaction requise', async () => {
    TestBed.configureTestingModule({ imports: [EquipmentStep] });
    const fixture = TestBed.createComponent(EquipmentStep);
    fixture.detectChanges();
    await fixture.whenStable();

    for (const item of FIXED_EQUIPMENT.individual) {
      expect(fixture.nativeElement.textContent).toContain(item);
    }
    for (const item of FIXED_EQUIPMENT.group) {
      expect(fixture.nativeElement.textContent).toContain(item);
    }
    expect(fixture.nativeElement.querySelectorAll('button, input').length).toBe(0);
  });
});
