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

  it('showOwnerInfo=true + personnage de joueur → affiche le nom affiché du propriétaire', async () => {
    TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
    const fixture = TestBed.createComponent(CharacterSummaryCard);
    fixture.componentRef.setInput('character', CHARACTER);
    fixture.componentRef.setInput('showOwnerInfo', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const badge = fixture.nativeElement.querySelector('.character-summary-card__owner-badge');
    expect(badge?.textContent?.trim()).toBe('Alice au pays');
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

  describe('density (Story 29.9, AC1)', () => {
    it('défaut medium → aucune classe de densité sur l’hôte', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.classList.contains('character-summary-card--large')).toBe(false);
      expect(fixture.nativeElement.classList.contains('character-summary-card--compact')).toBe(
        false,
      );
    });

    it('large → classe hôte character-summary-card--large posée', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.componentRef.setInput('density', 'large');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.classList.contains('character-summary-card--large')).toBe(true);
    });

    it('compact → classe hôte character-summary-card--compact posée', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.componentRef.setInput('density', 'compact');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.classList.contains('character-summary-card--compact')).toBe(
        true,
      );
    });
  });

  describe('typeLabel/groupRoleLabel/niveau/showStats/showMjMarker (Story 29.9)', () => {
    it('niveau toujours affiché à côté du nom', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', { ...CHARACTER, level: 3 });
      fixture.detectChanges();
      await fixture.whenStable();

      const level = fixture.nativeElement.querySelector('.character-summary-card__level');
      expect(level?.textContent?.trim()).toBe('Niv. 3');
    });

    it('typeLabel fourni → affiché ; absent (défaut null) → aucun élément rendu', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.character-summary-card__type')).toBeNull();

      fixture.componentRef.setInput('typeLabel', 'Attaque');
      fixture.detectChanges();
      await fixture.whenStable();
      const el = fixture.nativeElement.querySelector('.character-summary-card__type');
      expect(el?.textContent?.trim()).toBe('Attaque');
    });

    it('groupRoleLabel fourni → affiché ; absent (défaut null) → aucun élément rendu', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.componentRef.setInput('groupRoleLabel', 'Chef');
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement.querySelector('.character-summary-card__group-role');
      expect(el?.textContent?.trim()).toBe('Chef');
    });

    it('showStats=false (défaut true) → aucun stat-pill PV/PE/Initiative/Encombrement', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.stat-pill')).not.toBeNull();

      fixture.componentRef.setInput('showStats', false);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.stat-pill')).toBeNull();
    });

    it('showMjMarker=true + ownerIsMj=true → badge MJ affiché, distinct de showOwnerInfo (jamais le nom du joueur)', async () => {
      const mjCharacter: CharacterDto = { ...CHARACTER, ownerIsMj: true };
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', mjCharacter);
      fixture.componentRef.setInput('showMjMarker', true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(
        fixture.nativeElement.querySelector('.character-summary-card__mj-marker'),
      ).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-identity-label')).toBeNull();
    });

    it('showMjMarker=true + ownerIsMj=false → aucun badge MJ', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.componentRef.setInput('showMjMarker', true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.character-summary-card__mj-marker')).toBeNull();
    });
  });

  // Retour utilisateur (Story 29.9) : la bulle apposée sur le cercle, patron déjà établi par
  // RosterStrip/RosterRail — le même signal ne doit pas avoir deux rendus selon l'écran.
  describe('bulle de montée de niveau (Story 29.9, retour utilisateur)', () => {
    const pending: CharacterDto = { ...CHARACTER, xp: 150 };

    async function render(density?: 'large' | 'medium' | 'compact') {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', pending);
      if (density) fixture.componentRef.setInput('density', density);
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture;
    }

    it('est apposée sur le cercle de l’avatar, pas dans le bloc d’infos', async () => {
      const fixture = await render();
      const badge = fixture.nativeElement.querySelector('.character-summary-card__levelup-badge');
      expect(badge.closest('.character-summary-card__avatar')).not.toBeNull();
      expect(badge.closest('.character-summary-card__info')).toBeNull();
    });

    it('porte un symbole, jamais le libellé texte — mais reste annoncé (aria-label)', async () => {
      const fixture = await render();
      const badge = fixture.nativeElement.querySelector('.character-summary-card__levelup-badge');
      expect(badge.textContent.trim()).toBe('▲');
      expect(badge.getAttribute('aria-label')).toBeTruthy();
      expect(badge.getAttribute('role')).toBe('img');
    });

    it('reste visible en mode liste (la densité ne fait pas disparaître un signal)', async () => {
      const fixture = await render('compact');
      expect(
        fixture.nativeElement.querySelector('.character-summary-card__levelup-badge'),
      ).not.toBeNull();
    });
  });

  // Retour utilisateur (Story 29.9) : classe et Partie sont les deux repères à conserver en mode
  // liste ; la première implémentation masquait toute info secondaire.
  describe('mode liste : sous-ligne « Classe · Partie » (Story 29.9, AC1)', () => {
    async function renderCompact(inputs: Record<string, unknown>) {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.componentRef.setInput('density', 'compact');
      for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture;
    }

    it('classe et partie fusionnées en une seule sous-ligne', async () => {
      const fixture = await renderCompact({
        className: 'Marchand',
        partieName: 'La Forêt Noire',
      });

      const sub = fixture.nativeElement.querySelector('.character-summary-card__compact-sub');
      expect(sub.textContent.trim()).toBe('Marchand · La Forêt Noire');
      // Les spans empilés des modes moyen/grand ne sont pas rendus : c'est ce qui écrasait le nom.
      expect(fixture.nativeElement.querySelector('.character-summary-card__class')).toBeNull();
      expect(fixture.nativeElement.querySelector('.character-summary-card__partie')).toBeNull();
    });

    it('un seul des deux renseigné → pas de séparateur orphelin', async () => {
      const fixture = await renderCompact({ className: 'Marchand' });
      const sub = fixture.nativeElement.querySelector('.character-summary-card__compact-sub');
      expect(sub.textContent.trim()).toBe('Marchand');
    });

    it('aucun des deux → aucune sous-ligne rendue', async () => {
      const fixture = await renderCompact({});
      expect(
        fixture.nativeElement.querySelector('.character-summary-card__compact-sub'),
      ).toBeNull();
    });

    it('le niveau reste affiché à côté du nom en mode liste', async () => {
      const fixture = await renderCompact({});
      expect(fixture.nativeElement.querySelector('.character-summary-card__level')).not.toBeNull();
    });
  });

  describe('partieName (Story 29.2, AC3)', () => {
    it('partieName fourni → affiché', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.componentRef.setInput('partieName', 'La Forêt Noire');
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement.querySelector('.character-summary-card__partie');
      expect(el?.textContent?.trim()).toBe('La Forêt Noire');
    });

    it('partieName absent (défaut null) → aucun élément rendu (comportement inchangé des sites existants)', async () => {
      TestBed.configureTestingModule({ imports: [CharacterSummaryCard] });
      const fixture = TestBed.createComponent(CharacterSummaryCard);
      fixture.componentRef.setInput('character', CHARACTER);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.character-summary-card__partie')).toBeNull();
    });
  });
});
