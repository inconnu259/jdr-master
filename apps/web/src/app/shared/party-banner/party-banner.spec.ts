import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { Theme } from '@master-jdr/shared';
import { PartyBanner } from './party-banner';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../core/theme/tones';
import { bannerParams, partyMonogram } from '../../core/parties/party-banner.util';

const PARTIE_ID = '3f2b8c1a-4d5e-6f70-8a9b-1c2d3e4f5a6b';
const PARTIE_NAME = 'Les Cendres de Kavaan';

function makeThemeService(theme: Theme = 'grimoire-emeraude') {
  const activeTheme = signal<Theme>(theme);
  return {
    activeTheme,
    tone: signal(TONE_MAP[theme]),
  };
}

async function render(
  mode: 'large' | 'medium' | 'compact',
  themeSvc = makeThemeService(),
  name = PARTIE_NAME,
) {
  await TestBed.configureTestingModule({
    imports: [PartyBanner],
    providers: [{ provide: ThemeToneService, useValue: themeSvc }],
  }).compileComponents();
  const fixture = TestBed.createComponent(PartyBanner);
  fixture.componentRef.setInput('partieId', PARTIE_ID);
  fixture.componentRef.setInput('partieName', name);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, themeSvc };
}

/** Neutralise les identifiants SVG scopés par instance (`pb1`, `pb2`…) avant de comparer deux
 *  compositions : ils sont précisément ce qui DOIT différer pour que plusieurs bannières
 *  coexistent dans un même document, et ils ne font pas partie de la composition. */
function composition(fixture: { nativeElement: HTMLElement }): string {
  const svg = fixture.nativeElement.querySelector('svg.party-banner');
  return (svg?.innerHTML ?? '').replace(/pb\d+/g, 'pbX');
}

describe('PartyBanner — les trois rendus (Story 29.10, AC4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mode grand → composition SVG pleine largeur, aucun monogramme', async () => {
    const { fixture } = await render('large');
    const svg = fixture.nativeElement.querySelector('svg.party-banner');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 160 88');
    expect(fixture.nativeElement.querySelector('.party-banner__monogram')).toBeNull();
    expect(fixture.nativeElement.classList.contains('party-banner-host--large')).toBe(true);
  });

  it('mode moyen → LA MÊME composition, recadrée au centre par preserveAspectRatio (jamais redessinée)', async () => {
    const large = await render('large');
    const largeComposition = composition(large.fixture);
    TestBed.resetTestingModule();

    const { fixture } = await render('medium');
    const svg = fixture.nativeElement.querySelector('svg.party-banner');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
    expect(composition(fixture)).toBe(largeComposition);
    expect(fixture.nativeElement.querySelector('.party-banner__monogram')).toBeNull();
  });

  it('mode liste → rendu PROPRE : monogramme, et surtout aucune composition SVG', async () => {
    const { fixture } = await render('compact');
    expect(fixture.nativeElement.querySelector('svg.party-banner')).toBeNull();
    const monogram = fixture.nativeElement.querySelector('.party-banner__monogram');
    expect(monogram.textContent.trim()).toBe('CK');
    expect(monogram.textContent.trim()).toBe(partyMonogram(PARTIE_NAME));
  });

  it('mode liste → la vignette porte la dominante colorée tirée (seul repère à 28 px)', async () => {
    const { fixture } = await render('compact');
    const vignette = fixture.nativeElement.querySelector('.party-banner--compact');
    const expected =
      bannerParams(PARTIE_ID, 'grimoire-emeraude').dominant === 'accent-1' ? 'tint-1' : 'tint-2';
    expect(vignette.classList.contains(expected)).toBe(true);
  });

  it('décoratif dans les trois modes : aria-hidden, aucun rôle, aucun libellé', async () => {
    for (const mode of ['large', 'medium', 'compact'] as const) {
      const { fixture } = await render(mode);
      const root = fixture.nativeElement.querySelector('[aria-hidden="true"]');
      expect(root).not.toBeNull();
      expect(root.getAttribute('role')).toBeNull();
      expect(root.getAttribute('aria-label')).toBeNull();
      TestBed.resetTestingModule();
    }
  });
});

describe('PartyBanner — dérivation (Story 29.10, AC1, AC2, AC3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renommer la partie ne change que le monogramme, jamais la composition', async () => {
    const first = await render('large');
    const firstComposition = composition(first.fixture);
    TestBed.resetTestingModule();

    const second = await render('large', makeThemeService(), 'Un Tout Autre Nom');
    expect(composition(second.fixture)).toBe(firstComposition);
  });

  it('changer de thème change le style mais pas le monogramme', async () => {
    const emeraude = await render('compact');
    expect(
      emeraude.fixture.nativeElement.querySelector('.party-banner__monogram').textContent.trim(),
    ).toBe('CK');

    emeraude.themeSvc.activeTheme.set('medieval-steampunk');
    emeraude.fixture.detectChanges();
    await emeraude.fixture.whenStable();

    expect(
      emeraude.fixture.nativeElement.querySelector('.party-banner__monogram').textContent.trim(),
    ).toBe('CK');
  });

  it('changer de thème rend une composition différente (le thème sélectionne le style)', async () => {
    const { fixture, themeSvc } = await render('large');
    const emeraudeComposition = composition(fixture);

    themeSvc.activeTheme.set('medieval-steampunk');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(composition(fixture)).not.toBe(emeraudeComposition);
  });

  it('deux instances de la même partie produisent exactement la même composition (AC3)', async () => {
    const a = await render('large');
    const compositionA = composition(a.fixture);
    TestBed.resetTestingModule();
    const b = await render('large');

    expect(composition(b.fixture)).toBe(compositionA);
  });

  it('les identifiants SVG sont uniques par instance — deux bannières ne partagent pas leurs défs', async () => {
    await TestBed.configureTestingModule({
      imports: [PartyBanner],
      providers: [{ provide: ThemeToneService, useValue: makeThemeService('medieval-steampunk') }],
    }).compileComponents();

    const makeOne = () => {
      const f = TestBed.createComponent(PartyBanner);
      f.componentRef.setInput('partieId', PARTIE_ID);
      f.componentRef.setInput('partieName', PARTIE_NAME);
      f.componentRef.setInput('mode', 'large');
      f.detectChanges();
      return f.nativeElement.querySelector('g[id]').getAttribute('id');
    };

    expect(makeOne()).not.toBe(makeOne());
  });
});

describe('PartyBanner — composition par thème (Story 29.10, AC6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('grimoire-emeraude → étoiles et comètes rendues, chacune dans un repère pivoté unique', async () => {
    const { fixture } = await render('large', makeThemeService('grimoire-emeraude'));
    const params = bannerParams(PARTIE_ID, 'grimoire-emeraude');

    expect(fixture.nativeElement.querySelectorAll('.party-banner__star').length).toBe(
      params.theme === 'grimoire-emeraude' ? params.stars.length : -1,
    );
    const comets = fixture.nativeElement.querySelectorAll('.party-banner__comet');
    expect(comets.length).toBe(params.theme === 'grimoire-emeraude' ? params.comets.length : -1);

    // §8 : un SEUL θ porte orientation, position de tête et sens. La queue part de l'origine du
    // repère et la tête est posée à son extrémité — jamais deux valeurs à tenir accordées.
    for (const comet of comets) {
      expect(comet.getAttribute('transform')).toMatch(
        /^translate\([-\d. ]+\) rotate\(-?[\d.]+\) scale\(-?1 1\)$/,
      );
      const tail = comet.querySelector('.party-banner__comet-tail');
      const head = comet.querySelector('.party-banner__comet-head');
      expect(tail.getAttribute('x')).toBe('0');
      expect(head.getAttribute('cx')).toBe(tail.getAttribute('width'));
    }
  });

  it('foret-ancienne → exactement 2 halos, et un seul type d’élément mobile', async () => {
    const { fixture } = await render('large', makeThemeService('foret-ancienne'));
    expect(fixture.nativeElement.querySelectorAll('.party-banner__halo').length).toBe(2);

    const leaves = fixture.nativeElement.querySelectorAll('.party-banner__leaf').length;
    const motes = fixture.nativeElement.querySelectorAll('.party-banner__mote').length;
    // Exclusivité : l'un des deux compteurs est nécessairement nul.
    expect(leaves === 0 || motes === 0).toBe(true);
    expect(leaves + motes).toBeGreaterThan(0);
  });

  it('medieval-steampunk → grille constante et manomètre présents sur toute bannière', async () => {
    const { fixture } = await render('large', makeThemeService('medieval-steampunk'));
    expect(fixture.nativeElement.querySelector('.party-banner__grid')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.party-banner__gauge')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelectorAll('.party-banner__gear').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('medieval-steampunk → le manomètre est dessiné APRÈS les rouages (il reste au-dessus)', async () => {
    const { fixture } = await render('large', makeThemeService('medieval-steampunk'));
    const svg = fixture.nativeElement.querySelector('svg.party-banner');
    const nodes = Array.from(svg.querySelectorAll('.party-banner__gear, .party-banner__gauge'));
    expect((nodes[nodes.length - 1] as Element).classList.contains('party-banner__gauge')).toBe(
      true,
    );
  });
});
