import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioDrafts } from './scenario-drafts';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

const DRAFT_1: ScenarioDto = {
  id: 's1',
  partieId: 'p1',
  title: 'Le Marché aux Ombres',
  description: null,
  status: 'BROUILLON',
  dureeHeures: null,
  dureeSeances: null,
  resumeFin: null,
  createdAt: '2026-07-12T00:00:00.000Z',
  closedAt: null,
};

const DRAFT_2: ScenarioDto = { ...DRAFT_1, id: 's2', title: 'Les Ombres du Passé' };

async function createComponent(
  drafts: ScenarioDto[] = [DRAFT_1, DRAFT_2],
  { withInput = true, routeParam = null as string | null } = {},
) {
  const scenariosSvc = {
    listDrafts: vi.fn().mockResolvedValue(drafts),
    open: vi.fn().mockResolvedValue({ ...DRAFT_1, status: 'A_VENIR' }),
  };
  const router = { navigate: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [ScenarioDrafts],
    providers: [
      provideAnimationsAsync(),
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeParam } } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioDrafts);
  if (withInput) fixture.componentRef.setInput('partieId', 'p1');
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, scenariosSvc, router };
}

describe('ScenarioDrafts', () => {
  it('liste les brouillons de la Partie', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    expect(scenariosSvc.listDrafts).toHaveBeenCalledWith('p1');
    expect(fixture.nativeElement.textContent).toContain('Le Marché aux Ombres');
    expect(fixture.nativeElement.textContent).toContain('Les Ombres du Passé');
  });

  it('clic sur « + Nouveau scénario » → navigation vers scenarios/new', async () => {
    const { fixture, router } = await createComponent();
    const comp = fixture.componentInstance as any;
    comp.newScenario();
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'scenarios', 'new']);
  });

  it('clic sur une ligne (hors bouton) → navigation vers le détail avec le scénario en état', async () => {
    const { fixture, router } = await createComponent();
    const comp = fixture.componentInstance as any;
    comp.openScenario(DRAFT_1);
    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'scenarios', 's1'], {
      state: { scenario: DRAFT_1 },
    });
  });

  it('clic sur « Ouvrir aux joueurs » appelle open() et retire la ligne sans naviguer', async () => {
    const { fixture, scenariosSvc, router } = await createComponent();
    const comp = fixture.componentInstance as any;
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as Event;
    await comp.openToPlayers(DRAFT_1, fakeEvent);
    expect(scenariosSvc.open).toHaveBeenCalledWith('s1');
    expect(comp.drafts()).toEqual([DRAFT_2]);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('sans [partieId] en entrée (route directe) → repli sur le paramètre de route `:id`', async () => {
    const { scenariosSvc } = await createComponent([DRAFT_1, DRAFT_2], {
      withInput: false,
      routeParam: 'p1',
    });
    expect(scenariosSvc.listDrafts).toHaveBeenCalledWith('p1');
  });

  it('ni [partieId] ni paramètre de route → message d’erreur, aucun appel API', async () => {
    const { fixture, scenariosSvc } = await createComponent([], { withInput: false });
    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBeTruthy();
    expect(scenariosSvc.listDrafts).not.toHaveBeenCalled();
  });
});
