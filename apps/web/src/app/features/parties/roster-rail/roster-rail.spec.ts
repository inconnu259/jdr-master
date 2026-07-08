import { TestBed } from '@angular/core/testing';
import type { PartieMemberDto } from '@master-jdr/shared';
import { RosterRail } from './roster-rail';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';

const MEMBERS: PartieMemberDto[] = [
  {
    userId: 'mj1',
    pseudo: 'Sylas',
    email: 'sylas@example.com',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    userId: 'u1',
    pseudo: 'Alice',
    email: 'alice@example.com',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
];

const CHARACTERS = [
  makeCharacterDto({ id: 'c1', userId: 'u1', sheetData: { narrative: { name: 'Fenn' } } }),
];

describe('RosterRail', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(hasFreeSlot = true) {
    TestBed.configureTestingModule({ imports: [RosterRail] });
    const fixture = TestBed.createComponent(RosterRail);
    fixture.componentRef.setInput('members', MEMBERS);
    fixture.componentRef.setInput('characters', CHARACTERS);
    fixture.componentRef.setInput('mjId', 'mj1');
    fixture.componentRef.setInput('hasFreeSlot', hasFreeSlot);
    fixture.componentRef.setInput('classLabelFor', () => 'Ménestrel');
    fixture.detectChanges();
    return fixture;
  }

  it('est replié par défaut (pas la classe --expanded)', () => {
    const fixture = setup();
    const el: HTMLElement = fixture.nativeElement.querySelector('.roster-rail');
    expect(el.classList.contains('roster-rail--expanded')).toBe(false);
  });

  it('se déplie au clic sur le bouton toggle', () => {
    const fixture = setup();
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.roster-rail__toggle');
    toggle.click();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.roster-rail');
    expect(el.classList.contains('roster-rail--expanded')).toBe(true);
  });

  it("le badge MJ porte à la fois l'anneau de couleur (classe CSS) et un texte, jamais la couleur seule", () => {
    const fixture = setup();
    const mjItem: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="mj1"]');
    expect(mjItem.classList.contains('roster-rail__item--mj')).toBe(true);
    expect(mjItem.querySelector('.roster-rail__mj-badge')?.textContent?.trim()).toBe('MJ');
  });

  it("un joueur (non MJ) n'a pas le badge MJ", () => {
    const fixture = setup();
    const playerItem: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="u1"]');
    expect(playerItem.classList.contains('roster-rail__item--mj')).toBe(false);
    expect(playerItem.querySelector('.roster-rail__mj-badge')).toBeNull();
  });

  it('slot "+ Inviter" visible si hasFreeSlot=true', () => {
    const fixture = setup(true);
    expect(fixture.nativeElement.querySelector('.roster-rail__invite-slot')).not.toBeNull();
  });

  it('slot "+ Inviter" absent si hasFreeSlot=false', () => {
    const fixture = setup(false);
    expect(fixture.nativeElement.querySelector('.roster-rail__invite-slot')).toBeNull();
  });

  it("aria-label complet dès l'état replié (nom + rôle), pas seulement une icône", () => {
    const fixture = setup();
    const mjItem: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="mj1"]');
    expect(mjItem.getAttribute('aria-label')).toBe('Sylas — MJ');

    const playerItem: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="u1"]');
    expect(playerItem.getAttribute('aria-label')).toBe('Alice — Fenn (Ménestrel)');
  });

  it('un membre sans personnage encore créé a un aria-label explicite plutôt que vide', () => {
    const fixture = setup();
    fixture.componentRef.setInput('characters', []);
    fixture.detectChanges();
    const playerItem: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="u1"]');
    expect(playerItem.getAttribute('aria-label')).toBe('Alice — aucun personnage créé');
  });

  it('clic sur un membre ayant un personnage émet selectCharacter avec son characterId', () => {
    const fixture = setup();
    let emitted: { characterId: string } | undefined;
    fixture.componentInstance.selectCharacter.subscribe(
      (v: { characterId: string }) => (emitted = v),
    );
    const playerItem: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="u1"]');
    playerItem.click();
    expect(emitted).toEqual({ characterId: 'c1' });
  });

  it('clic sur le slot "+ Inviter" émet openInvitations', () => {
    const fixture = setup(true);
    let emitted = false;
    fixture.componentInstance.openInvitations.subscribe(() => (emitted = true));
    const slot: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.roster-rail__invite-slot',
    );
    slot.click();
    expect(emitted).toBe(true);
  });

  it('le slot "+ Inviter" a un aria-label thématisé (non vide)', () => {
    const fixture = setup(true);
    const slot: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.roster-rail__invite-slot',
    );
    expect(slot.getAttribute('aria-label')).toBe('Convier un compagnon');
  });

  it('le bouton toggle a un aria-label thématisé, jamais codé en dur', () => {
    const fixture = setup();
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.roster-rail__toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Déplier la troupe');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-label')).toBe('Replier la troupe');
  });

  it('un item du roster a une zone de tap de 36px (desktop), pas 44px (mobile)', () => {
    const fixture = setup();
    const item: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="u1"]');
    const minHeight = parseFloat(getComputedStyle(item).minHeight || '0');
    expect(minHeight).toBe(36);
  });

  it('la touche Espace active un membre au clavier comme Entrée', () => {
    const fixture = setup();
    let emitted: { characterId: string } | undefined;
    fixture.componentInstance.selectCharacter.subscribe(
      (v: { characterId: string }) => (emitted = v),
    );
    const playerItem: HTMLElement = fixture.nativeElement.querySelector('[data-user-id="u1"]');
    playerItem.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(emitted).toEqual({ characterId: 'c1' });
  });
});
