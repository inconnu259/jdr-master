import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { CharacterDto, PartieKind, ScenarioDto } from '@master-jdr/shared';
import { ScenarioReadDialog, type ScenarioReadDialogData } from './scenario-read-dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

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

async function createComponent(
  scenario: ScenarioDto,
  {
    partieKind = 'ONE_SHOT' as PartieKind,
    characters = [] as CharacterDto[],
    currentUserId = 'viewer1',
  }: { partieKind?: PartieKind; characters?: CharacterDto[]; currentUserId?: string } = {},
) {
  const dialogRef = { close: vi.fn() };
  const data: ScenarioReadDialogData = { scenario, partieKind, characters };
  const scenariosSvc = { participate: vi.fn() };
  const authSvc = { currentUser: () => ({ id: currentUserId }) };

  await TestBed.configureTestingModule({
    imports: [ScenarioReadDialog],
    providers: [
      provideAnimationsAsync(),
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: AuthService, useValue: authSvc },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioReadDialog);
  fixture.detectChanges();
  return { fixture, dialogRef, scenariosSvc };
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

  describe('Participation (AC8, Story 8.1)', () => {
    it.each(['ONE_SHOT', 'CAMPAGNE_LINEAIRE'] as const)(
      '%s → section participants/bouton absents',
      async (partieKind) => {
        const { fixture } = await createComponent(
          { ...BASE, status: 'COURANT' },
          { partieKind },
        );
        expect(fixture.nativeElement.textContent).not.toContain('Participer à cette enquête');
        expect(fixture.nativeElement.querySelector('.participants')).toBeNull();
      },
    );

    it('CAMPAGNE_EPISODIQUE, utilisateur non participant → bouton visible', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'COURANT', participants: [] },
        { partieKind: 'CAMPAGNE_EPISODIQUE', currentUserId: 'viewer1' },
      );
      expect(fixture.nativeElement.textContent).toContain('Participer à cette enquête');
    });

    it('clic → appelle participate, scenario() réassigné, bouton disparaît sans rechargement', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...BASE, status: 'COURANT', participants: [] },
        { partieKind: 'CAMPAGNE_EPISODIQUE', currentUserId: 'viewer1' },
      );
      const comp = fixture.componentInstance as any;
      scenariosSvc.participate.mockResolvedValue({
        ...BASE,
        status: 'COURANT',
        participants: [{ userId: 'viewer1', pseudo: 'Viewer' }],
      });

      await comp.participate();
      fixture.detectChanges();

      expect(scenariosSvc.participate).toHaveBeenCalledWith('s1');
      expect(comp.isParticipating()).toBe(true);
      expect(fixture.nativeElement.textContent).not.toContain('Participer à cette enquête');
    });

    it('échec → participantError affiche le message serveur, scenario() inchangé', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...BASE, status: 'COURANT', participants: [] },
        { partieKind: 'CAMPAGNE_EPISODIQUE', currentUserId: 'viewer1' },
      );
      const comp = fixture.componentInstance as any;
      scenariosSvc.participate.mockRejectedValue(
        new HttpErrorResponse({ status: 500, error: { message: 'Erreur serveur' } }),
      );

      await comp.participate();

      expect(comp.participantError()).toBe('Erreur serveur');
      expect(comp.isParticipating()).toBe(false);
    });

    it('participant sans personnage dans characters → aucune CharacterSummaryCard fantôme, pseudo affiché en secours', async () => {
      const char: CharacterDto = {
        id: 'c1',
        userId: 'other-user',
        partieId: 'p1',
        gameSystemId: 'ryuutama',
        sheetData: {},
        derived: {} as any,
        portraitUrl: null,
        portraitCropData: null,
        pdfPortraitCropData: null,
      } as CharacterDto;
      const { fixture } = await createComponent(
        {
          ...BASE,
          status: 'COURANT',
          participants: [{ userId: 'viewer1', pseudo: 'Viewer' }],
        },
        { partieKind: 'CAMPAGNE_EPISODIQUE', characters: [char], currentUserId: 'viewer1' },
      );
      expect(fixture.nativeElement.querySelector('app-character-summary-card')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Viewer');
      expect(fixture.nativeElement.textContent).toContain('pas encore de personnage');
    });
  });
});
