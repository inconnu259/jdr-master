import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { ScenarioDocumentDto, ScenarioDto } from '@master-jdr/shared';
import { ScenarioEditor } from './scenario-editor';
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

const OWN_DOC: ScenarioDocumentDto = {
  id: 'd1',
  partieId: 'p1',
  scenarioId: 's1',
  originalName: 'lettre.pdf',
  sizeBytes: 12,
  createdAt: '2026-07-12T00:00:00.000Z',
};

const LIBRARY_DOC: ScenarioDocumentDto = {
  id: 'd2',
  partieId: 'p1',
  scenarioId: null,
  originalName: 'carte.pdf',
  sizeBytes: 34,
  createdAt: '2026-07-12T00:00:00.000Z',
};

async function createComponent(scenario: ScenarioDto = SCENARIO) {
  const scenariosSvc = {
    listDocuments: vi.fn().mockResolvedValue([OWN_DOC, LIBRARY_DOC]),
    update: vi.fn(),
    uploadDocument: vi.fn(),
    downloadDocument: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [ScenarioEditor],
    providers: [provideAnimationsAsync(), { provide: ScenariosService, useValue: scenariosSvc }],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioEditor);
  fixture.componentRef.setInput('scenario', scenario);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, scenariosSvc };
}

describe('ScenarioEditor', () => {
  it('charge les documents et les répartit en 2 listes (scénario / bibliothèque)', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;
    expect(comp.ownDocuments()).toEqual([OWN_DOC]);
    expect(comp.libraryDocuments()).toEqual([LIBRARY_DOC]);
  });

  it('édition d’un champ (FieldEditPencil) déclenche update()', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    scenariosSvc.update.mockResolvedValue({ ...SCENARIO, title: 'Nouveau titre' });
    await comp.onFieldConfirm('title', 'Nouveau titre');
    expect(scenariosSvc.update).toHaveBeenCalledWith('s1', { title: 'Nouveau titre' });
    expect(comp.scenario().title).toBe('Nouveau titre');
  });

  it('échec d’édition remonte le message d’erreur backend (pas un message générique)', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    scenariosSvc.update.mockRejectedValue(
      new HttpErrorResponse({ status: 400, error: { message: 'Titre trop long.' } }),
    );
    await comp.onFieldConfirm('title', 'x'.repeat(300));
    expect(comp.fieldEditError()).toBe('Titre trop long.');
  });

  it('statut PASSE → pas de FieldEditPencil, mais durées affichées en lecture seule', async () => {
    const { fixture } = await createComponent({ ...SCENARIO, status: 'PASSE' });
    expect(fixture.nativeElement.querySelector('app-field-edit-pencil')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('3 h');
  });

  it('statut PASSE → onFieldConfirm/submitDescription ignorés même si appelés directement (garde-fou runtime)', async () => {
    const { fixture, scenariosSvc } = await createComponent({ ...SCENARIO, status: 'PASSE' });
    const comp = fixture.componentInstance as any;
    await comp.onFieldConfirm('title', 'Nouveau titre');
    await comp.submitDescription();
    expect(scenariosSvc.update).not.toHaveBeenCalled();
  });

  it('upload réussi rafraîchit la liste de documents et réinitialise l’input file', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    const file = new File(['%PDF'], 'nouveau.pdf', { type: 'application/pdf' });
    scenariosSvc.uploadDocument.mockResolvedValue(OWN_DOC);
    scenariosSvc.listDocuments.mockResolvedValue([OWN_DOC, LIBRARY_DOC]);
    const inputEl = { files: [file], value: 'nouveau.pdf' };
    await comp.onScenarioFileSelected({ target: inputEl });
    expect(scenariosSvc.uploadDocument).toHaveBeenCalledWith('p1', file, 's1');
    expect(inputEl.value).toBe('');
  });

  it('upload en erreur affiche le message renvoyé par l’API', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    const file = new File(['%PDF'], 'trop-gros.pdf', { type: 'application/pdf' });
    scenariosSvc.uploadDocument.mockRejectedValue(
      new HttpErrorResponse({ status: 413, error: { message: 'Fichier trop volumineux (max 5 Mo).' } }),
    );
    await comp.onScenarioFileSelected({ target: { files: [file], value: 'trop-gros.pdf' } });
    expect(comp.uploadError()).toBe('Fichier trop volumineux (max 5 Mo).');
  });

  it('téléchargement en erreur affiche un message, ne lève pas d’exception non gérée', async () => {
    const { fixture, scenariosSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    scenariosSvc.downloadDocument.mockRejectedValue(new Error('network'));
    await comp.downloadDocument(OWN_DOC);
    expect(comp.downloadError()).toBeTruthy();
  });
});
