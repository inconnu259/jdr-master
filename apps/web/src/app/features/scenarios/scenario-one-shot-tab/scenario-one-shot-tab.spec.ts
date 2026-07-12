import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioOneShotTab } from './scenario-one-shot-tab';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

const SCENARIO: ScenarioDto = {
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

async function createComponent(drafts: ScenarioDto[] = [SCENARIO]) {
  const scenariosSvc = {
    listDrafts: vi.fn().mockResolvedValue(drafts),
    open: vi.fn().mockResolvedValue({ ...SCENARIO, status: 'A_VENIR' }),
    listDocuments: vi.fn().mockResolvedValue([]),
  };

  await TestBed.configureTestingModule({
    imports: [ScenarioOneShotTab],
    providers: [provideAnimationsAsync(), { provide: ScenariosService, useValue: scenariosSvc }],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioOneShotTab);
  fixture.componentRef.setInput('partieId', 'p1');
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, scenariosSvc };
}

describe('ScenarioOneShotTab', () => {
  it('charge le scénario unique via listDrafts() et affiche l’éditeur, avec le bouton Ouvrir', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    expect(scenariosSvc.listDrafts).toHaveBeenCalledWith('p1');
    expect(fixture.nativeElement.querySelector('app-scenario-editor')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Ouvrir aux joueurs');
  });

  it('sans scénario en BROUILLON (déjà ouvert) → message expliquant la limite temporaire', async () => {
    const { fixture } = await createComponent([]);
    const comp = fixture.componentInstance as any;
    expect(comp.notFound()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Story 7.5');
  });

  it('clic sur Ouvrir aux joueurs appelle open() et met à jour le statut affiché (bouton disparaît)', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    await comp.openToPlayers();
    expect(scenariosSvc.open).toHaveBeenCalledWith('s1');
    expect(comp.scenario().status).toBe('A_VENIR');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Ouvrir aux joueurs');
  });

  it('échec de open() → message d’erreur affiché', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    scenariosSvc.open.mockRejectedValue(new Error('fail'));
    await comp.openToPlayers();
    expect(comp.openError()).toBeTruthy();
  });
});
