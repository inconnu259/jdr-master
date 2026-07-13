import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioReadDialog, type ScenarioReadDialogData } from './scenario-read-dialog';

const BASE: ScenarioDto = {
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

async function createComponent(scenario: ScenarioDto) {
  const dialogRef = { close: vi.fn() };
  const data: ScenarioReadDialogData = { scenario };

  await TestBed.configureTestingModule({
    imports: [ScenarioReadDialog],
    providers: [
      provideAnimationsAsync(),
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioReadDialog);
  fixture.detectChanges();
  return { fixture, dialogRef };
}

describe('ScenarioReadDialog', () => {
  it('A_VENIR → titre seul, aucune description/documents même non-null (AC2)', async () => {
    const { fixture } = await createComponent({ ...BASE, status: 'A_VENIR' });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Le Marché aux Ombres');
    expect(text).not.toContain('Une enquête discrète.');
    expect(text).not.toContain('3 h');
  });

  it('COURANT → titre, badge, description complète, durées, sans résumé (AC9)', async () => {
    const { fixture } = await createComponent({ ...BASE, status: 'COURANT' });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Une enquête discrète.');
    expect(text).toContain('3 h');
    expect(text).toContain('En cours');
    expect(text).not.toContain('Résumé de fin');
  });

  it('PASSE avec résumé → description + résumé de fin affichés (AC8)', async () => {
    const { fixture } = await createComponent({
      ...BASE,
      status: 'PASSE',
      resumeFin: 'Les PJ ont déjoué le complot.',
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Une enquête discrète.');
    expect(text).toContain('Les PJ ont déjoué le complot.');
  });

  it('PASSE sans résumé → message neutre, pas d’incitation MJ', async () => {
    const { fixture } = await createComponent({ ...BASE, status: 'PASSE', resumeFin: null });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Aucun résumé pour l’instant.');
  });

  it('aucun élément interactif d’édition dans le DOM, quel que soit le statut', async () => {
    for (const status of ['A_VENIR', 'COURANT', 'PASSE'] as const) {
      const { fixture } = await createComponent({ ...BASE, status });
      expect(fixture.nativeElement.querySelector('app-field-edit-pencil')).toBeNull();
      expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('BROUILLON (garde défensive) → titre seul, comme A_VENIR, même si jamais ouvert en pratique', async () => {
    const { fixture } = await createComponent({ ...BASE, status: 'BROUILLON' });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Le Marché aux Ombres');
    expect(text).not.toContain('Une enquête discrète.');
    expect(text).not.toContain('3 h');
  });

  it('bouton Fermer appelle dialogRef.close()', async () => {
    const { fixture, dialogRef } = await createComponent(BASE);
    const comp = fixture.componentInstance as unknown as { close: () => void };
    comp.close();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
