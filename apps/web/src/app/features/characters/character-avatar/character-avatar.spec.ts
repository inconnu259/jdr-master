import { TestBed } from '@angular/core/testing';
import { CharacterAvatar } from './character-avatar';

describe('CharacterAvatar', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(name: string, size?: 44 | 64) {
    TestBed.configureTestingModule({ imports: [CharacterAvatar] });
    const fixture = TestBed.createComponent(CharacterAvatar);
    fixture.componentRef.setInput('name', name);
    if (size) fixture.componentRef.setInput('size', size);
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
});
