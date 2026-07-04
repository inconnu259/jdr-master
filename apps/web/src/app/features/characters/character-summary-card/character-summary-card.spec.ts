import { TestBed } from '@angular/core/testing';
import type { CharacterDto } from '@master-jdr/shared';
import { CharacterSummaryCard } from './character-summary-card';

const CHARACTER: CharacterDto = {
  id: 'c1',
  userId: 'u1',
  partieId: 'p1',
  gameSystemId: 'ryuutama',
  sheetData: { narrative: { name: 'Fenn' } },
  derived: { PV: 16, PE: 12, Condition: 14, Initiative: 10, Encombrement: 11 },
  portraitUrl: null,
  portraitCropData: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CharacterSummaryCard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche le nom, la classe et les badges PV/PE/Initiative/Encombrement', async () => {
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', CHARACTER);
    fixture.componentRef.setInput('className', 'Ménestrel');
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Fenn');
    expect(text).toContain('Ménestrel');
    expect(text).toContain('PV 16');
    expect(text).toContain('PE 12');
    expect(text).toContain('Initiative 10');
    expect(text).toContain('Encombrement max 11');
  });

  it('émet selected() au clic', async () => {
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', CHARACTER);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted = false;
    fixture.componentInstance.selected.subscribe(() => (emitted = true));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(emitted).toBe(true);
  });
});
