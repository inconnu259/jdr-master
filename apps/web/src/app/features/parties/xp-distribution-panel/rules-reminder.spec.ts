import { TestBed } from '@angular/core/testing';
import { RulesReminder } from './rules-reminder';

describe('RulesReminder', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('rendu statique, aucune interaction/output', async () => {
    TestBed.configureTestingModule({ imports: [RulesReminder] });
    const fixture = TestBed.createComponent(RulesReminder);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Calcul assisté');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
