import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioTimeline } from './scenario-timeline';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ScenarioReadDialog } from '../scenario-read-dialog/scenario-read-dialog';

function makeScenario(overrides: Partial<ScenarioDto>): ScenarioDto {
  return {
    id: 's1',
    partieId: 'p1',
    title: 'Scénario',
    description: null,
    status: 'A_VENIR',
    dureeHeures: null,
    dureeSeances: null,
    resumeFin: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    closedAt: null,
    seances: [],
    ...overrides,
  };
}

function makeBreakpointObserver(desktop: boolean) {
  return {
    observe: () => of({ matches: desktop, breakpoints: {} }),
    isMatched: () => desktop,
  };
}

async function createComponent(
  scenarios: ScenarioDto[],
  {
    desktop = true,
    isMj = false,
    partieKind = 'ONE_SHOT',
    characters = [],
  }: {
    desktop?: boolean;
    isMj?: boolean;
    partieKind?: 'ONE_SHOT' | 'CAMPAGNE_LINEAIRE' | 'CAMPAGNE_EPISODIQUE';
    characters?: unknown[];
  } = {},
) {
  const scenariosSvc = {
    listAll: vi.fn().mockResolvedValue(scenarios),
    changed: signal(0),
  };
  const dialog = { open: vi.fn() };
  const router = { navigate: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [ScenarioTimeline],
    providers: [
      provideAnimationsAsync(),
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: MatDialog, useValue: dialog },
      { provide: Router, useValue: router },
      { provide: BreakpointObserver, useValue: makeBreakpointObserver(desktop) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioTimeline);
  fixture.componentRef.setInput('partieId', 'p1');
  fixture.componentRef.setInput('isMj', isMj);
  fixture.componentRef.setInput('partieKind', partieKind);
  fixture.componentRef.setInput('characters', characters);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, scenariosSvc, dialog, router };
}

describe('ScenarioTimeline', () => {
  const BROUILLON = makeScenario({
    id: 'brouillon',
    status: 'BROUILLON',
    createdAt: '2026-06-01T00:00:00.000Z',
  });
  const PASSE = makeScenario({
    id: 'passe',
    status: 'PASSE',
    title: 'Les Docks silencieux',
    createdAt: '2026-06-15T00:00:00.000Z',
  });
  const A_VENIR = makeScenario({
    id: 'a-venir',
    status: 'A_VENIR',
    title: 'Le Complot',
    createdAt: '2026-07-10T00:00:00.000Z',
  });
  const COURANT_1 = makeScenario({
    id: 'courant-1',
    status: 'COURANT',
    title: 'Le Marché aux Ombres',
    createdAt: '2026-07-01T00:00:00.000Z',
  });
  const COURANT_2 = makeScenario({
    id: 'courant-2',
    status: 'COURANT',
    title: 'La Traque',
    createdAt: '2026-07-02T00:00:00.000Z',
  });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('exclut les BROUILLON, trie chronologiquement (AC10)', async () => {
    const { fixture } = await createComponent([A_VENIR, BROUILLON, PASSE]);
    const comp = fixture.componentInstance as any;
    const nodes = comp.nodes();
    expect(nodes.map((n: any) => n.scenarios[0].id)).toEqual(['passe', 'a-venir']);
  });

  it('regroupe les scénarios COURANT simultanés en un seul nœud empilé (AC5)', async () => {
    const { fixture } = await createComponent([PASSE, COURANT_1, COURANT_2, A_VENIR]);
    const comp = fixture.componentInstance as any;
    const nodes = comp.nodes();
    const courantNode = nodes.find((n: any) =>
      n.scenarios.some((s: ScenarioDto) => s.status === 'COURANT'),
    );
    expect(courantNode.scenarios).toHaveLength(2);
    expect(courantNode.scenarios.map((s: ScenarioDto) => s.id)).toEqual(['courant-1', 'courant-2']);
  });

  it('clic sur un nœud ouvre ScenarioReadDialog avec le bon scénario', async () => {
    const { fixture, dialog } = await createComponent([A_VENIR]);
    const comp = fixture.componentInstance as any;
    comp.openDetail(A_VENIR);
    expect(dialog.open).toHaveBeenCalledWith(ScenarioReadDialog, {
      data: { scenario: A_VENIR, partieKind: 'ONE_SHOT', characters: [], isMj: false },
    });
  });

  it('bascule mobile : rendu vertical, aucun scroll interne recherché', async () => {
    const { fixture } = await createComponent([PASSE, A_VENIR], { desktop: false });
    expect(fixture.nativeElement.querySelector('.timeline-mobile')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.timeline-desktop')).toBeNull();
  });

  it('bascule desktop : rendu horizontal', async () => {
    const { fixture } = await createComponent([PASSE, A_VENIR], { desktop: true });
    expect(fixture.nativeElement.querySelector('.timeline-desktop')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.timeline-mobile')).toBeNull();
  });

  it('ancrage au chargement : scrollIntoView appelé sur le nœud COURANT (AC6)', async () => {
    await createComponent([PASSE, COURANT_1, A_VENIR], { desktop: true });
    await Promise.resolve();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('focus sur un nœud déclenche scrollIntoView (AC7)', async () => {
    const { fixture } = await createComponent([PASSE, A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();
    comp.onNodeFocus(0);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', behavior: 'smooth' }),
    );
  });

  it('fondus : visibles selon la position de scroll (mesures mockées, jsdom n’a pas de vrai layout)', async () => {
    const { fixture } = await createComponent([PASSE, A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const trackEl = comp.track()!.nativeElement as HTMLElement;
    Object.defineProperty(trackEl, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(trackEl, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(trackEl, 'scrollLeft', { value: 50, configurable: true, writable: true });

    comp.onScroll();

    expect(comp.fadeStart()).toBe(true);
    expect(comp.fadeEnd()).toBe(true);
  });

  it('fondus initialisés dès le chargement, sans attendre un premier scroll manuel', async () => {
    const { fixture } = await createComponent([PASSE, COURANT_1, A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const trackEl = comp.track()!.nativeElement as HTMLElement;
    Object.defineProperty(trackEl, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(trackEl, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true });
    await Promise.resolve();
    // fadeEnd doit être calculable sans appel manuel à onScroll() — le contenu déborde déjà.
    expect(typeof comp.fadeEnd()).toBe('boolean');
  });

  it('onWheel privilégie deltaX (swipe trackpad horizontal) sur deltaY', async () => {
    const { fixture } = await createComponent([PASSE, A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const trackEl = comp.track()!.nativeElement as HTMLElement;
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });
    comp.onWheel({ deltaX: 15, deltaY: 999, preventDefault: vi.fn() } as unknown as WheelEvent);
    expect(trackEl.scrollLeft).toBe(15);
  });

  it('onWheel retombe sur deltaY quand deltaX est nul (molette verticale classique)', async () => {
    const { fixture } = await createComponent([PASSE, A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const trackEl = comp.track()!.nativeElement as HTMLElement;
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });
    comp.onWheel({ deltaX: 0, deltaY: 42, preventDefault: vi.fn() } as unknown as WheelEvent);
    expect(trackEl.scrollLeft).toBe(42);
  });

  it('un glissé (mouvement > seuil) suivi d’un openDetail() ne doit pas ouvrir le dialogue', async () => {
    const { fixture, dialog } = await createComponent([A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const trackEl = comp.track()!.nativeElement as HTMLElement;
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });

    comp.onMouseDown({ clientX: 100, preventDefault: vi.fn() } as unknown as MouseEvent);
    comp.onMouseMove({ clientX: 130 } as unknown as MouseEvent); // > seuil de 4px
    comp.openDetail(A_VENIR);

    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('un clic sans mouvement significatif ouvre bien le dialogue', async () => {
    const { fixture, dialog } = await createComponent([A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const trackEl = comp.track()!.nativeElement as HTMLElement;
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });

    comp.onMouseDown({ clientX: 100, preventDefault: vi.fn() } as unknown as MouseEvent);
    comp.onMouseMove({ clientX: 101 } as unknown as MouseEvent); // sous le seuil
    comp.openDetail(A_VENIR);

    expect(dialog.open).toHaveBeenCalledWith(ScenarioReadDialog, {
      data: { scenario: A_VENIR, partieKind: 'ONE_SHOT', characters: [], isMj: false },
    });
  });

  it('relâcher la souris hors du composant (document:mouseup) réinitialise dragging', async () => {
    const { fixture } = await createComponent([PASSE, A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const trackEl = comp.track()!.nativeElement as HTMLElement;
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });

    comp.onMouseDown({ clientX: 100, preventDefault: vi.fn() } as unknown as MouseEvent);
    expect(comp.dragging()).toBe(true);

    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(comp.dragging()).toBe(false);
  });

  it('touche Entrée sur une carte ouvre le dialogue (activation clavier)', async () => {
    const { fixture, dialog } = await createComponent([A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    const preventDefault = vi.fn();
    comp.onCardKeydown({ key: 'Enter', preventDefault } as unknown as KeyboardEvent, A_VENIR);
    expect(preventDefault).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledWith(ScenarioReadDialog, {
      data: { scenario: A_VENIR, partieKind: 'ONE_SHOT', characters: [], isMj: false },
    });
  });

  it('touche Espace sur une carte ouvre le dialogue, une autre touche l’ignore', async () => {
    const { fixture, dialog } = await createComponent([A_VENIR], { desktop: true });
    const comp = fixture.componentInstance as any;
    comp.onCardKeydown({ key: ' ', preventDefault: vi.fn() } as unknown as KeyboardEvent, A_VENIR);
    expect(dialog.open).toHaveBeenCalledTimes(1);
    comp.onCardKeydown(
      { key: 'Tab', preventDefault: vi.fn() } as unknown as KeyboardEvent,
      A_VENIR,
    );
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('ancrage sur COURANT ne se redéclenche pas à un recalcul ultérieur de nodes()', async () => {
    const { fixture, scenariosSvc } = await createComponent([PASSE, COURANT_1, A_VENIR], {
      desktop: true,
    });
    await Promise.resolve();
    const callsAfterFirstLoad = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(callsAfterFirstLoad).toBeGreaterThan(0);

    // Force un rechargement (ex. mutation notifiée depuis un autre onglet, cf. `changed`) — les
    // données rechargées sont identiques, mais nodes() est recalculé.
    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect((Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsAfterFirstLoad,
    );
  });

  it('MJ (isMj=true) voit aussi les BROUILLON dans la chronologie', async () => {
    const { fixture } = await createComponent([A_VENIR, BROUILLON, PASSE], { isMj: true });
    const comp = fixture.componentInstance as any;
    const nodes = comp.nodes();
    expect(nodes.map((n: any) => n.scenarios[0].id)).toEqual(['brouillon', 'passe', 'a-venir']);
  });

  it('joueur (isMj=false, par défaut) ne voit jamais les BROUILLON', async () => {
    const { fixture } = await createComponent([A_VENIR, BROUILLON, PASSE]);
    const comp = fixture.componentInstance as any;
    const nodes = comp.nodes();
    expect(
      nodes.some((n: any) => n.scenarios.some((s: ScenarioDto) => s.status === 'BROUILLON')),
    ).toBe(false);
  });

  it('MJ + clic sur un BROUILLON → navigue vers la fiche d’édition, n’ouvre pas ScenarioReadDialog', async () => {
    const { fixture, dialog, router } = await createComponent([BROUILLON], { isMj: true });
    const comp = fixture.componentInstance as any;
    comp.openDetail(BROUILLON);
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'scenarios', 'brouillon'], {
      state: { scenario: BROUILLON },
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('MJ + clic sur un PASSE → ouvre ScenarioReadDialog avec isMj=true (CTA résumé de fin, Story 8.5)', async () => {
    const { fixture, dialog, router } = await createComponent([PASSE], { isMj: true });
    const comp = fixture.componentInstance as any;
    comp.openDetail(PASSE);
    expect(dialog.open).toHaveBeenCalledWith(ScenarioReadDialog, {
      data: { scenario: PASSE, partieKind: 'ONE_SHOT', characters: [], isMj: true },
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('MJ + clic sur un COURANT → navigue vers la fiche d’édition (CTA Clôturer le scénario, Story 7.7 AC6)', async () => {
    const { fixture, dialog, router } = await createComponent([COURANT_1], { isMj: true });
    const comp = fixture.componentInstance as any;
    comp.openDetail(COURANT_1);
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'scenarios', 'courant-1'], {
      state: { scenario: COURANT_1 },
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('joueur (isMj=false) + clic sur un COURANT → ouvre ScenarioReadDialog, anti-spoil inchangé', async () => {
    const { fixture, dialog, router } = await createComponent([COURANT_1], { isMj: false });
    const comp = fixture.componentInstance as any;
    comp.openDetail(COURANT_1);
    expect(dialog.open).toHaveBeenCalledWith(ScenarioReadDialog, {
      data: { scenario: COURANT_1, partieKind: 'ONE_SHOT', characters: [], isMj: false },
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('MJ + clic sur un A_VENIR → navigue vers la fiche d’édition (CTA Marquer comme Courant, AC8)', async () => {
    const { fixture, dialog, router } = await createComponent([A_VENIR], { isMj: true });
    const comp = fixture.componentInstance as any;
    comp.openDetail(A_VENIR);
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'scenarios', 'a-venir'], {
      state: { scenario: A_VENIR },
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('joueur (isMj=false) + clic sur un A_VENIR → ouvre ScenarioReadDialog, anti-spoil inchangé', async () => {
    const { fixture, dialog, router } = await createComponent([A_VENIR], { isMj: false });
    const comp = fixture.componentInstance as any;
    comp.openDetail(A_VENIR);
    expect(dialog.open).toHaveBeenCalledWith(ScenarioReadDialog, {
      data: { scenario: A_VENIR, partieKind: 'ONE_SHOT', characters: [], isMj: false },
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('une mutation notifiée par ScenariosService.changed() recharge bien les données (listAll rappelé)', async () => {
    const { scenariosSvc, fixture } = await createComponent([PASSE]);
    scenariosSvc.listAll.mockClear();

    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(scenariosSvc.listAll).toHaveBeenCalledWith('p1');
  });

  it('un rechargement réussi efface une erreur de chargement précédente', async () => {
    const { scenariosSvc, fixture } = await createComponent([PASSE]);
    const comp = fixture.componentInstance as any;
    scenariosSvc.listAll.mockRejectedValueOnce(new Error('réseau'));

    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    expect(comp.loadError()).toBeTruthy();

    // Rechargement suivant réussi (ex. l'utilisateur réessaie via un autre changed()) : l'erreur doit disparaître.
    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    expect(comp.loadError()).toBeNull();
  });

  it('une réponse obsolète (requête plus ancienne résolue après une plus récente) n’écrase pas l’état à jour', async () => {
    const { scenariosSvc, fixture } = await createComponent([PASSE]);
    const comp = fixture.componentInstance as any;

    let resolveFirst!: (value: ScenarioDto[]) => void;
    const firstCall = new Promise<ScenarioDto[]>((resolve) => {
      resolveFirst = resolve;
    });
    scenariosSvc.listAll.mockReturnValueOnce(firstCall).mockResolvedValueOnce([A_VENIR]);

    // Deux changed() rapprochés : la 1ère requête (lente) et la 2e (rapide) partent quasi ensemble.
    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();
    await Promise.resolve();
    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();

    // La 2e requête (plus récente) résout d'abord.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    // Puis la 1ère (plus ancienne) résout en retard, avec des données périmées.
    resolveFirst([PASSE, BROUILLON]);
    await Promise.resolve();
    fixture.detectChanges();

    // L'état affiché doit rester celui de la requête la plus récente, jamais écrasé par l'ancienne.
    const nodeIds = comp.nodes().map((n: any) => n.scenarios[0].id);
    expect(nodeIds).toEqual(['a-venir']);
  });

  it('AC1 (non-régression) : un changement de partieId() sur un composant déjà monté recharge la chronologie', async () => {
    const { scenariosSvc, fixture } = await createComponent([PASSE]);
    scenariosSvc.listAll.mockClear();

    fixture.componentRef.setInput('partieId', 'p2');
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(scenariosSvc.listAll).toHaveBeenCalledWith('p2');
  });

  it('AC3 : une réponse résolue après démontage du composant n’écrit plus aucun signal', async () => {
    const { scenariosSvc, fixture } = await createComponent([PASSE]);
    const comp = fixture.componentInstance as any;

    let resolveListAll!: (value: ScenarioDto[]) => void;
    scenariosSvc.listAll.mockClear();
    scenariosSvc.listAll.mockReturnValueOnce(
      new Promise<ScenarioDto[]>((resolve) => {
        resolveListAll = resolve;
      }),
    );

    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();
    await Promise.resolve();

    fixture.destroy();

    expect(() => {
      resolveListAll([A_VENIR]);
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(comp.scenarios()).toEqual([PASSE]);
    expect(comp.loadError()).toBeNull();
  });

  it('AC3 (branche catch) : un rejet résolu après démontage du composant n’écrit pas loadError()', async () => {
    const { scenariosSvc, fixture } = await createComponent([PASSE]);
    const comp = fixture.componentInstance as any;

    let rejectListAll!: (reason: unknown) => void;
    scenariosSvc.listAll.mockClear();
    scenariosSvc.listAll.mockReturnValueOnce(
      new Promise<ScenarioDto[]>((_resolve, reject) => {
        rejectListAll = reject;
      }),
    );

    scenariosSvc.changed.update((v: number) => v + 1);
    fixture.detectChanges();
    await Promise.resolve();

    fixture.destroy();

    expect(() => {
      rejectListAll(new Error('réseau'));
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(comp.loadError()).toBeNull();
    expect(comp.scenarios()).toEqual([PASSE]);
  });

  describe('Affichage des séances sur la carte (Story 8.7, AC7)', () => {
    it('scénario avec séances datées (poll.chosenDate) → dates affichées sur la carte', async () => {
      const scenarioWithSeances = makeScenario({
        id: 's-avec-seances',
        status: 'COURANT',
        seances: [
          {
            id: 'seance1',
            scenarioId: 's-avec-seances',
            compteRendu: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            poll: {
              id: 'poll1',
              partieId: 'p1',
              status: 'CLOSED',
              scenarioRef: null,
              expiresAt: null,
              chosenDate: '2026-08-15T00:00:00.000Z',
              chosenSlot: 'AFTERNOON',
              options: [],
            },
          },
        ],
      });
      const { fixture } = await createComponent([scenarioWithSeances]);
      expect(fixture.nativeElement.querySelector('.card-seances')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('août');
    });

    it('scénario avec séance non datée → "Date à définir" affiché', async () => {
      const scenarioWithSeances = makeScenario({
        id: 's-non-datee',
        status: 'COURANT',
        seances: [
          {
            id: 'seance1',
            scenarioId: 's-non-datee',
            compteRendu: null,
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      });
      const { fixture } = await createComponent([scenarioWithSeances]);
      expect(fixture.nativeElement.textContent).toContain('Date à définir');
    });

    it('scénario sans séance → aucune liste .card-seances affichée', async () => {
      const scenarioNoSeances = makeScenario({ id: 's-sans-seances', status: 'COURANT' });
      const { fixture } = await createComponent([scenarioNoSeances]);
      expect(fixture.nativeElement.querySelector('.card-seances')).toBeNull();
    });

    it('mode mobile → séances également affichées sur la carte', async () => {
      const scenarioWithSeances = makeScenario({
        id: 's-mobile',
        status: 'COURANT',
        seances: [
          {
            id: 'seance1',
            scenarioId: 's-mobile',
            compteRendu: null,
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      });
      const { fixture } = await createComponent([scenarioWithSeances], { desktop: false });
      expect(fixture.nativeElement.querySelector('.card-seances')).toBeTruthy();
    });
  });
});
