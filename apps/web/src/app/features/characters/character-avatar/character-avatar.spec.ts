import { TestBed } from '@angular/core/testing';
import { CharacterAvatar } from './character-avatar';
import { API_BASE } from '../../../core/api-base';

describe('CharacterAvatar', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    name: string,
    size?: 26 | 38 | 44 | 64,
    portraitUrl?: string | null,
    cropData?: { scale: number; offsetX: number; offsetY: number } | null,
    characterId = 'char1',
  ) {
    TestBed.configureTestingModule({ imports: [CharacterAvatar] });
    const fixture = TestBed.createComponent(CharacterAvatar);
    fixture.componentRef.setInput('name', name);
    fixture.componentRef.setInput('characterId', characterId);
    if (size) fixture.componentRef.setInput('size', size);
    if (portraitUrl !== undefined) fixture.componentRef.setInput('portraitUrl', portraitUrl);
    if (cropData !== undefined) fixture.componentRef.setInput('cropData', cropData);
    fixture.detectChanges();
    return fixture;
  }

  it('dérive les initiales sur 2 mots (ex. "Fenn Voyageur" → "FV")', () => {
    const fixture = setup('Fenn Voyageur');
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.textContent?.trim()).toBe('FV');
  });

  it('dérive les initiales sur 1 mot (ex. "Fenn" → "F")', () => {
    const fixture = setup('Fenn');
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.textContent?.trim()).toBe('F');
  });

  it('nom vide → "?" plutôt qu\'un état cassé', () => {
    const fixture = setup('   ');
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.textContent?.trim()).toBe('?');
  });

  it('aria-label explicite "Portrait de [nom] (aucune image)"', () => {
    const fixture = setup('Fenn');
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.getAttribute('aria-label')).toBe('Portrait de Fenn (aucune image)');
  });

  it('taille par défaut 44px', () => {
    const fixture = setup('Fenn');
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.width).toBe('44px');
  });

  it('taille 64px si demandé', () => {
    const fixture = setup('Fenn', 64);
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.width).toBe('64px');
  });

  it('taille 38px (RosterRail) si demandé', () => {
    const fixture = setup('Fenn', 38);
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.width).toBe('38px');
  });

  it('taille 26px (RosterStrip) si demandé', () => {
    const fixture = setup('Fenn', 26);
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.width).toBe('26px');
  });

  it('fontSize 10px pour la taille 26px', () => {
    const fixture = setup('Fenn', 26);
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.fontSize).toBe('10px');
  });

  it('fontSize 14px pour la taille 38px', () => {
    const fixture = setup('Fenn', 38);
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.fontSize).toBe('14px');
  });

  it('fontSize 16px pour la taille 44px (défaut)', () => {
    const fixture = setup('Fenn', 44);
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.fontSize).toBe('16px');
  });

  it('fontSize 24px pour la taille 64px', () => {
    const fixture = setup('Fenn', 64);
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.style.fontSize).toBe('24px');
  });

  it("sans portraitUrl → affiche les initiales, pas d'image", () => {
    const fixture = setup('Fenn', 44, null);
    const img = fixture.nativeElement.querySelector('.character-avatar__img');
    expect(img).toBeNull();
    expect(fixture.nativeElement.querySelector('.character-avatar').textContent?.trim()).toBe('F');
  });

  it('avec portraitUrl → affiche une image via la route protégée /characters/:id/portrait, pas les initiales', () => {
    const fixture = setup('Fenn', 44, '/uploads/portraits/x.jpg', undefined, 'char1');
    const img: HTMLImageElement = fixture.nativeElement.querySelector('.character-avatar__img');
    expect(img).not.toBeNull();
    expect(img.src).toBe(`${API_BASE}/characters/char1/portrait`);
  });

  it('applique le transform CSS dérivé de cropData (scale/offset)', () => {
    const fixture = setup('Fenn', 44, '/uploads/portraits/x.jpg', {
      scale: 1.5,
      offsetX: 10,
      offsetY: -5,
    });
    const img: HTMLImageElement = fixture.nativeElement.querySelector('.character-avatar__img');
    expect(img.style.transform).toBe('translate(10%, -5%) scale(1.5)');
  });

  it('cropData absent avec portrait présent → transform par défaut (scale 1, offset 0)', () => {
    const fixture = setup('Fenn', 44, '/uploads/portraits/x.jpg');
    const img: HTMLImageElement = fixture.nativeElement.querySelector('.character-avatar__img');
    expect(img.style.transform).toBe('translate(0%, 0%) scale(1)');
  });

  it('aria-label sans "(aucune image)" quand un portrait existe', () => {
    const fixture = setup('Fenn', 44, '/uploads/portraits/x.jpg');
    const el: HTMLElement = fixture.nativeElement.querySelector('.character-avatar');
    expect(el.getAttribute('aria-label')).toBe('Portrait de Fenn');
  });
});
