import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { of } from 'rxjs';
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
  seances: [],
};

async function createComponent(
  scenario: ScenarioDto | undefined,
  listAllResult: ScenarioDto[] | 'reject' = [],
) {
  const scenariosSvc = {
    listDocuments: vi.fn().mockResolvedValue([]),
    listAll:
      listAllResult === 'reject'
        ? vi.fn().mockRejectedValue(new Error('network'))
        : vi.fn().mockResolvedValue(listAllResult),
  };

  const router = {
    getCurrentNavigation: () => ({ extras: { state: scenario ? { scenario } : undefined } }),
    // Stubs requis par RouterLink (bouton "Retour à la partie") — pas de navigation réelle testée ici.
    createUrlTree: vi.fn().mockReturnValue({}),
    serializeUrl: vi.fn().mockReturnValue('/parties/p1'),
    navigateByUrl: vi.fn(),
    events: of(),
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
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, scenariosSvc };
}

describe('ScenarioDetail', () => {
  it('charge le scénario depuis l’état de navigation et affiche l’éditeur', async () => {
    const { fixture } = await createComponent(SCENARIO);
    const comp = fixture.componentInstance as any;
    expect(comp.scenario()).toEqual(SCENARIO);
    expect(fixture.nativeElement.querySelector('app-scenario-editor')).toBeTruthy();
  });

  it('sans état de navigation, scénario introuvable via la liste de secours → message d’erreur', async () => {
    const { fixture, scenariosSvc } = await createComponent(undefined, []);
    const comp = fixture.componentInstance as any;
    expect(scenariosSvc.listAll).toHaveBeenCalledWith('s1');
    expect(comp.loadError()).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-scenario-editor')).toBeNull();
  });

  it('sans état de navigation (F5/accès direct), scénario retrouvé via GET /parties/:id/scenarios → charge quand même', async () => {
    const { fixture, scenariosSvc } = await createComponent(undefined, [SCENARIO]);
    const comp = fixture.componentInstance as any;
    expect(scenariosSvc.listAll).toHaveBeenCalledWith('s1');
    expect(comp.loadError()).toBeNull();
    expect(comp.scenario()).toEqual(SCENARIO);
    expect(fixture.nativeElement.querySelector('app-scenario-editor')).toBeTruthy();
  });

  it('sans état de navigation, la liste de secours échoue (réseau) → message d’erreur générique', async () => {
    const { fixture } = await createComponent(undefined, 'reject');
    const comp = fixture.componentInstance as any;
    expect(comp.loadError()).toBeTruthy();
  });

  it('lien "Retour à la partie" présent même sur la branche d’erreur (pas seulement quand le scénario a chargé)', async () => {
    const { fixture } = await createComponent(undefined, []);
    expect(fixture.nativeElement.querySelector('a')?.textContent).toContain('Retour à la partie');
  });

  it('lien "Retour à la partie" présent quand le scénario a chargé', async () => {
    const { fixture } = await createComponent(SCENARIO);
    expect(fixture.nativeElement.querySelector('a')?.textContent).toContain('Retour à la partie');
  });

  it('état de navigation présent mais scenarioId différent du paramètre de route → tente la liste de secours', async () => {
    const { fixture, scenariosSvc } = await createComponent(
      { ...SCENARIO, id: 'autre-scenario' },
      [],
    );
    const comp = fixture.componentInstance as any;
    expect(scenariosSvc.listAll).toHaveBeenCalledWith('s1');
    expect(comp.loadError()).toBeTruthy();
    expect(comp.scenario()).toBeNull();
  });
});
