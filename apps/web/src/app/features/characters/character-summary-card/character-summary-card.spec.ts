import { TestBed } from '@angular/core/testing';
import type { CharacterDto } from '@master-jdr/shared';
import { CharacterSummaryCard } from './character-summary-card';
import { API_BASE } from '../../../core/api-base';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';

const CHARACTER: CharacterDto = makeCharacterDto({
  id: 'c1',
  sheetData: { narrative: { name: 'Fenn' } },
});

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

  it('transmet portraitUrl/portraitCropData/id du personnage à CharacterAvatar', async () => {
    const withPortrait: CharacterDto = {
      ...CHARACTER,
      portraitUrl: '/uploads/portraits/x.jpg',
      portraitCropData: { scale: 1.4, offsetX: 2, offsetY: -3 },
    };
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', withPortrait);
    fixture.detectChanges();
    await fixture.whenStable();

    const img: HTMLImageElement = fixture.nativeElement.querySelector('.character-avatar__img');
    expect(img.src).toBe(`${API_BASE}/characters/${withPortrait.id}/portrait`);
    expect(img.style.transform).toBe('translate(2%, -3%) scale(1.4)');
  });

  it('showOwnerInfo=false (viewer joueur) → aucun badge/pseudo affiché, même si ownerPseudo est renseigné', async () => {
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', CHARACTER);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.character-summary-card__owner-badge')).toBeNull();
  });

  it('showOwnerInfo=true + personnage de joueur → affiche le pseudo du propriétaire', async () => {
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', CHARACTER);
    fixture.componentRef.setInput('showOwnerInfo', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const badge = fixture.nativeElement.querySelector('.character-summary-card__owner-badge');
    expect(badge?.textContent?.trim()).toBe('alice');
  });

  it('showOwnerInfo=true + personnage du MJ → affiche le badge MJ thématisé, pas le pseudo', async () => {
    const mjCharacter: CharacterDto = { ...CHARACTER, ownerIsMj: true, ownerPseudo: 'le-mj' };
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', mjCharacter);
    fixture.componentRef.setInput('showOwnerInfo', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const badge = fixture.nativeElement.querySelector('.character-summary-card__owner-badge');
    // Valeur exacte dépend du thème actif (tones.ts, clé `character.owner_badge_mj`) :
    // 'Maître' (ryuutama), 'Guide' (default), 'Ingénieur' (steampunk).
    expect(['Maître', 'Guide', 'Ingénieur']).toContain(badge?.textContent?.trim());
  });

  it('personnage avec un niveau en attente → badge de montée de niveau affiché', async () => {
    const pending: CharacterDto = { ...CHARACTER, xp: 150 };
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', pending);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('.character-summary-card__levelup-badge'),
    ).not.toBeNull();
  });

  it('personnage sans niveau en attente → aucun badge de montée de niveau', async () => {
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', CHARACTER);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('.character-summary-card__levelup-badge'),
    ).toBeNull();
  });
});
