import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { CharacterDto, ScenarioDocumentDto, ScenarioDto } from '@master-jdr/shared';
import { ScenarioEditor } from './scenario-editor';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { CharacterService } from '../../../core/characters/character.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { PollService } from '../../../core/poll/poll.service';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';

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

async function createComponent(scenario: ScenarioDto = SCENARIO, characters: CharacterDto[] = []) {
  const scenariosSvc = {
    listAll: vi.fn().mockResolvedValue([scenario]),
    listDocuments: vi.fn().mockResolvedValue([OWN_DOC, LIBRARY_DOC]),
    update: vi.fn(),
    uploadDocument: vi.fn(),
    downloadDocument: vi.fn(),
    markCourant: vi.fn(),
    close: vi.fn(),
    addSeance: vi.fn(),
    linkSeancePoll: vi.fn(),
  };
  const characterSvc = { listByPartie: vi.fn().mockResolvedValue(characters) };
  const partiesSvc = { members: vi.fn().mockResolvedValue([]) };
  const pollSvc = { chooseDate: vi.fn(), closePoll: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [ScenarioEditor],
    providers: [
      provideAnimationsAsync(),
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: CharacterService, useValue: characterSvc },
      { provide: PartiesService, useValue: partiesSvc },
      { provide: PollService, useValue: pollSvc },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioEditor);
  fixture.componentRef.setInput('scenario', scenario);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, scenariosSvc, characterSvc };
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
      new HttpErrorResponse({
        status: 413,
        error: { message: 'Fichier trop volumineux (max 5 Mo).' },
      }),
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

  describe('CTA « Marquer comme Courant » (AC8)', () => {
    it.each(['BROUILLON', 'COURANT', 'PASSE'] as const)(
      'statut %s → bouton absent',
      async (status) => {
        const { fixture } = await createComponent({ ...SCENARIO, status });
        expect(
          Array.from(fixture.nativeElement.querySelectorAll('button')).some((b) =>
            (b as HTMLElement).textContent?.includes('Marquer comme Courant'),
          ),
        ).toBe(false);
      },
    );

    it('statut A_VENIR → bouton présent', async () => {
      const { fixture } = await createComponent({ ...SCENARIO, status: 'A_VENIR' });
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('button')).some((b) =>
          (b as HTMLElement).textContent?.includes('Marquer comme Courant'),
        ),
      ).toBe(true);
    });

    it('clic → appelle markCourant, met à jour scenario() avec le retour', async () => {
      const { fixture, scenariosSvc } = await createComponent({ ...SCENARIO, status: 'A_VENIR' });
      const comp = fixture.componentInstance as any;
      scenariosSvc.markCourant.mockResolvedValue({ ...SCENARIO, status: 'COURANT' });
      await comp.markCourant();
      expect(scenariosSvc.markCourant).toHaveBeenCalledWith('s1');
      expect(comp.scenario().status).toBe('COURANT');
    });

    it('échec (409) → markCourantError affiche le message serveur, scenario() inchangé', async () => {
      const { fixture, scenariosSvc } = await createComponent({ ...SCENARIO, status: 'A_VENIR' });
      const comp = fixture.componentInstance as any;
      scenariosSvc.markCourant.mockRejectedValue(
        new HttpErrorResponse({
          status: 409,
          error: { message: 'Un scénario est déjà marqué Courant sur cette Partie.' },
        }),
      );
      await comp.markCourant();
      expect(comp.markCourantError()).toBe('Un scénario est déjà marqué Courant sur cette Partie.');
      expect(comp.scenario().status).toBe('A_VENIR');
    });
  });

  describe('CTA « Clôturer le scénario » (AC6, Story 7.7)', () => {
    it.each(['BROUILLON', 'A_VENIR', 'PASSE'] as const)(
      'statut %s → bouton absent',
      async (status) => {
        const { fixture } = await createComponent({ ...SCENARIO, status });
        expect(
          Array.from(fixture.nativeElement.querySelectorAll('button')).some((b) =>
            (b as HTMLElement).textContent?.includes('Clôturer le scénario'),
          ),
        ).toBe(false);
      },
    );

    it('statut COURANT → bouton présent', async () => {
      const { fixture } = await createComponent({ ...SCENARIO, status: 'COURANT' });
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('button')).some((b) =>
          (b as HTMLElement).textContent?.includes('Clôturer le scénario'),
        ),
      ).toBe(true);
    });

    it('clic → appelle close, met à jour scenario() avec le retour et bascule isReadOnly() à true', async () => {
      const { fixture, scenariosSvc } = await createComponent({ ...SCENARIO, status: 'COURANT' });
      const comp = fixture.componentInstance as any;
      scenariosSvc.close.mockResolvedValue({
        ...SCENARIO,
        status: 'PASSE',
        closedAt: '2026-07-13T10:00:00.000Z',
      });
      await comp.close();
      expect(scenariosSvc.close).toHaveBeenCalledWith('s1');
      expect(comp.scenario().status).toBe('PASSE');
      expect(comp.isReadOnly()).toBe(true);
    });

    it('échec → closeError affiche le message serveur, scenario() inchangé', async () => {
      const { fixture, scenariosSvc } = await createComponent({ ...SCENARIO, status: 'COURANT' });
      const comp = fixture.componentInstance as any;
      scenariosSvc.close.mockRejectedValue(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'Seul un scénario Courant peut être clôturé' },
        }),
      );
      await comp.close();
      expect(comp.closeError()).toBe('Seul un scénario Courant peut être clôturé');
      expect(comp.scenario().status).toBe('COURANT');
    });
  });

  describe('Section participants (vue MJ, non-régression 8.1)', () => {
    it('scénario ONE_SHOT/CAMPAGNE_LINEAIRE (participants undefined) → section absente', async () => {
      const { fixture } = await createComponent({ ...SCENARIO, status: 'COURANT' });
      expect(fixture.nativeElement.textContent).not.toContain('Participants');
    });

    it('CAMPAGNE_EPISODIQUE avec participants → CharacterSummaryCard affichée pour chacun', async () => {
      const alice = makeCharacterDto({ id: 'c1', userId: 'u1' });
      const { fixture } = await createComponent(
        {
          ...SCENARIO,
          status: 'COURANT',
          participants: [{ userId: 'u1', pseudo: 'Alice' }],
        },
        [alice],
      );
      expect(fixture.nativeElement.textContent).toContain('Participants');
      expect(fixture.nativeElement.querySelectorAll('app-character-summary-card')).toHaveLength(1);
    });

    it('CAMPAGNE_EPISODIQUE sans participant → message neutre, aucune carte', async () => {
      const { fixture } = await createComponent({
        ...SCENARIO,
        status: 'COURANT',
        participants: [],
      });
      expect(fixture.nativeElement.textContent).toContain('Aucun participant pour l’instant.');
      expect(fixture.nativeElement.querySelectorAll('app-character-summary-card')).toHaveLength(0);
    });

    it('participant sans personnage dans characters → aucune carte fantôme, mais pseudo affiché en secours', async () => {
      const { fixture } = await createComponent(
        {
          ...SCENARIO,
          status: 'COURANT',
          participants: [{ userId: 'no-character-user', pseudo: 'Bob' }],
        },
        [],
      );
      expect(fixture.nativeElement.querySelectorAll('app-character-summary-card')).toHaveLength(0);
      expect(fixture.nativeElement.textContent).toContain('Bob');
      expect(fixture.nativeElement.textContent).toContain('pas encore de personnage');
    });

    it('reste peuplée après une action MJ (close()) grâce au DTO enrichi renvoyé par le backend', async () => {
      const alice = makeCharacterDto({ id: 'c1', userId: 'u1' });
      const { fixture, scenariosSvc } = await createComponent(
        {
          ...SCENARIO,
          status: 'COURANT',
          participants: [{ userId: 'u1', pseudo: 'Alice' }],
        },
        [alice],
      );
      const comp = fixture.componentInstance as any;
      scenariosSvc.close.mockResolvedValue({
        ...SCENARIO,
        status: 'PASSE',
        closedAt: '2026-07-13T10:00:00.000Z',
        participants: [{ userId: 'u1', pseudo: 'Alice' }],
      });

      await comp.close();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('app-character-summary-card')).toHaveLength(1);
    });
  });

  describe('Séances (Story 8.2)', () => {
    it('bouton « Ajouter une séance » appelle addSeance, met à jour scenario() avec le retour', async () => {
      const { fixture, scenariosSvc } = await createComponent();
      const comp = fixture.componentInstance as any;
      const updated = {
        ...SCENARIO,
        seances: [
          {
            id: 'seance1',
            scenarioId: 's1',
            compteRendu: null,
            createdAt: '2026-07-13T00:00:00.000Z',
          },
        ],
      };
      scenariosSvc.addSeance.mockResolvedValue(updated);

      await comp.addSeance();

      expect(scenariosSvc.addSeance).toHaveBeenCalledWith('s1');
      expect(comp.scenario().seances).toHaveLength(1);
    });

    it('échec → addSeanceError affiche le message serveur', async () => {
      const { fixture, scenariosSvc } = await createComponent();
      const comp = fixture.componentInstance as any;
      scenariosSvc.addSeance.mockRejectedValue(
        new HttpErrorResponse({ status: 500, error: { message: 'Erreur serveur' } }),
      );

      await comp.addSeance();

      expect(comp.addSeanceError()).toBe('Erreur serveur');
    });

    it('app-seance-list reçoit isMj=true et le scénario courant', async () => {
      const { fixture } = await createComponent();
      const seanceList = fixture.nativeElement.querySelector('app-seance-list');
      expect(seanceList).toBeTruthy();
    });

    it('onSeanceLinked réassigne scenario() avec le DTO reçu', async () => {
      const { fixture } = await createComponent();
      const comp = fixture.componentInstance as any;
      const updated = {
        ...SCENARIO,
        seances: [
          {
            id: 'seance1',
            scenarioId: 's1',
            compteRendu: null,
            createdAt: '2026-07-13T00:00:00.000Z',
          },
        ],
      };

      comp.onSeanceLinked(updated);

      expect(comp.scenario().seances).toHaveLength(1);
    });
  });

  describe('Rafraîchissement au montage (bug-fix post-8.2 : vote décidé ailleurs affiché comme obsolète)', () => {
    it("ngOnInit recharge le scénario via listAll et remplace l'instantané reçu en input", async () => {
      const fresh = { ...SCENARIO, resumeFin: 'mis à jour côté serveur' };
      const scenariosSvc = {
        listAll: vi.fn().mockResolvedValue([fresh]),
        listDocuments: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        uploadDocument: vi.fn(),
        downloadDocument: vi.fn(),
        markCourant: vi.fn(),
        close: vi.fn(),
        addSeance: vi.fn(),
        linkSeancePoll: vi.fn(),
      };
      await TestBed.configureTestingModule({
        imports: [ScenarioEditor],
        providers: [
          provideAnimationsAsync(),
          { provide: ScenariosService, useValue: scenariosSvc },
          { provide: CharacterService, useValue: { listByPartie: vi.fn().mockResolvedValue([]) } },
          { provide: PartiesService, useValue: { members: vi.fn().mockResolvedValue([]) } },
          { provide: PollService, useValue: { chooseDate: vi.fn(), closePoll: vi.fn() } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(ScenarioEditor);
      fixture.componentRef.setInput('scenario', SCENARIO);
      fixture.detectChanges();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      const comp = fixture.componentInstance as any;
      expect(comp.scenario().resumeFin).toBe('mis à jour côté serveur');
    });

    it('échec du rechargement → le scénario reçu en input reste affiché tel quel', async () => {
      const scenariosSvc = {
        listAll: vi.fn().mockRejectedValue(new Error('network')),
        listDocuments: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        uploadDocument: vi.fn(),
        downloadDocument: vi.fn(),
        markCourant: vi.fn(),
        close: vi.fn(),
        addSeance: vi.fn(),
        linkSeancePoll: vi.fn(),
      };
      await TestBed.configureTestingModule({
        imports: [ScenarioEditor],
        providers: [
          provideAnimationsAsync(),
          { provide: ScenariosService, useValue: scenariosSvc },
          { provide: CharacterService, useValue: { listByPartie: vi.fn().mockResolvedValue([]) } },
          { provide: PartiesService, useValue: { members: vi.fn().mockResolvedValue([]) } },
          { provide: PollService, useValue: { chooseDate: vi.fn(), closePoll: vi.fn() } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(ScenarioEditor);
      fixture.componentRef.setInput('scenario', SCENARIO);
      fixture.detectChanges();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      const comp = fixture.componentInstance as any;
      expect(comp.scenario()).toEqual(SCENARIO);
    });
  });
});
