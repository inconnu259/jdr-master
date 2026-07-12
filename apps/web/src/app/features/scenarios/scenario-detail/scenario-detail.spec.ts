import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioDetail } from './scenario-detail';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

const SCENARIO: ScenarioDto = {
  id: 's1',
  partieId: 'p1',
  title: 'Le Marché aux Ombres',
  description: 'Une enquête discrète.',
  status: 'A_VENIR',
  dureeHeures: 3,
  dureeSeances: null,
  resumeFin: null,
  createdAt: '2026-07-12T00:00:00.000Z',
  closedAt: null,
};

async function createComponent(scenario: ScenarioDto | undefined) {
  const scenariosSvc = { listDocuments: vi.fn().mockResolvedValue([]) };

  const router = {
    getCurrentNavigation: () => ({ extras: { state: scenario ? { scenario } : undefined } }),
  };

  await TestBed.configureTestingModule({
    imports: [ScenarioDetail],
    providers: [
      provideAnimationsAsync(),
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 's1' } } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioDetail);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, scenariosSvc };
}

describe('ScenarioDetail', () => {
  it('charge le scénario depuis l’état de navigation et affiche l’éditeur', async () => {
    const { fixture } = await createComponent(SCENARIO);
    const comp = fixture.componentInstance as any;
    expect(comp.scenario()).toEqual(SCENARIO);
    expect(fixture.nativeElement.querySelector('app-scenario-editor')).toBeTruthy();
  });

  it('sans état de navigation → message d’erreur, aucun rendu de l’éditeur', async () => {
    const { fixture, scenariosSvc } = await createComponent(undefined);
    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-scenario-editor')).toBeNull();
    expect(scenariosSvc.listDocuments).not.toHaveBeenCalled();
  });

  it('état de navigation présent mais scenarioId différent du paramètre de route → message d’erreur', async () => {
    const { fixture } = await createComponent({ ...SCENARIO, id: 'autre-scenario' });
    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBeTruthy();
    expect(comp.scenario()).toBeNull();
  });
});
