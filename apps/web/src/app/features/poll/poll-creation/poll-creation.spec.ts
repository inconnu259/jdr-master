import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { PollCreationComponent } from './poll-creation';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

function makeScenariosService() {
  return {
    createSeancePoll: vi.fn().mockResolvedValue({
      id: 's1',
      partieId: 'p1',
      title: 'Chapitre 1',
      description: null,
      status: 'COURANT',
      dureeHeures: null,
      dureeSeances: null,
      resumeFin: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      closedAt: null,
      seances: [
        {
          id: 'seance1',
          scenarioId: 's1',
          compteRendu: null,
          createdAt: '2026-07-13T00:00:00.000Z',
          poll: {
            id: 'poll1',
            partieId: 'p1',
            status: 'OPEN',
            scenarioRef: null,
            expiresAt: null,
            chosenDate: null,
            chosenSlot: null,
            options: [],
          },
        },
      ],
    }),
  };
}

function makeThemeService() {
  return { tone: () => ({ 'success.poll_created': 'Vote créé !' }) };
}

function makeSnackBar() {
  return { open: vi.fn() };
}

async function createComponent(preselectedCount = 0, seanceId = 'seance1') {
  const scenariosSvc = makeScenariosService();
  const snack = makeSnackBar();
  await TestBed.configureTestingModule({
    imports: [PollCreationComponent],
    providers: [
      provideAnimationsAsync(),
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: ThemeToneService, useValue: makeThemeService() },
      { provide: MatSnackBar, useValue: snack },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PollCreationComponent);
  fixture.componentRef.setInput('partieId', 'p1');
  fixture.componentRef.setInput('seanceId', seanceId);
  const slots = Array.from({ length: preselectedCount }, (_, i) => ({
    date: `2026-08-0${i + 1}`,
    slot: 'MORNING' as const,
    members: [{ userId: 'u1', pseudo: 'Alice', status: 'AVAILABLE' as const }],
  }));
  fixture.componentRef.setInput('preselectedSlots', slots);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, scenariosSvc, snack };
}

describe('PollCreationComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('avec 2 slots pré-sélectionnés cochés → bouton soumettre activé', async () => {
    const { fixture } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0);
    comp.toggleSlot(1);
    fixture.detectChanges();
    expect(comp.isValid()).toBe(true);
  });

  it('avec 0 slots sélectionnés → bouton soumettre désactivé', async () => {
    const { fixture } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    expect(comp.isValid()).toBe(false);
  });

  it("l'état coché suit l'identité (date, slot) du créneau, pas son index — insensible à une réorganisation de la liste", async () => {
    const { fixture } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    // Coche le créneau à l'index 0 (2026-08-01)
    comp.toggleSlot(0);
    fixture.detectChanges();
    expect(comp.isSlotChecked(0)).toBe(true);
    expect(comp.isSlotChecked(1)).toBe(false);

    // Le parent remplace la liste par la même paire dans l'ordre inverse (ex. tri différent côté API)
    fixture.componentRef.setInput('preselectedSlots', [
      { date: '2026-08-02', slot: 'MORNING', members: [] },
      { date: '2026-08-01', slot: 'MORNING', members: [] },
    ]);
    fixture.detectChanges();

    // Le créneau 2026-08-01 est toujours coché, même s'il est désormais à l'index 1
    expect(comp.isSlotChecked(1)).toBe(true);
    expect(comp.isSlotChecked(0)).toBe(false);
    expect(comp.totalSelected()).toBe(1);
  });

  it('créneau personnalisé identique à un créneau pré-sélectionné coché → dédoublonné avant envoi (AC3)', async () => {
    const { fixture, scenariosSvc } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0); // 2026-08-01, MORNING
    comp.toggleSlot(1); // 2026-08-02, MORNING
    comp.customSlots.set([{ date: '2026-08-01', slot: 'MORNING' }]); // doublon exact de l'index 0
    fixture.detectChanges();
    expect(comp.totalSelected()).toBe(3); // avant dédoublonnage : 2 cochés + 1 personnalisé

    await comp.onSubmit();

    expect(scenariosSvc.createSeancePoll).toHaveBeenCalledTimes(1);
    const options = scenariosSvc.createSeancePoll.mock.calls[0][1];
    expect(options).toHaveLength(2);
    expect(options).toEqual([
      { date: '2026-08-01', slot: 'MORNING' },
      { date: '2026-08-02', slot: 'MORNING' },
    ]);
  });

  it('champ "Nom de la séance" (scenarioRef) absent du DOM (Story 8.7 — mort, jamais exploité)', async () => {
    const { fixture } = await createComponent(2);
    expect(fixture.nativeElement.querySelector('#scenario-ref-input')).toBeNull();
  });

  describe('seanceId fourni (Story 8.7, AC1 — point d’entrée unique, un vote exige toujours une séance)', () => {
    it('onSubmit() appelle scenariosService.createSeancePoll avec les options attendues', async () => {
      const { fixture, scenariosSvc } = await createComponent(2, 'seance1');
      const comp = fixture.componentInstance as any;
      comp.toggleSlot(0);
      comp.toggleSlot(1);
      fixture.detectChanges();

      await comp.onSubmit();

      expect(scenariosSvc.createSeancePoll).toHaveBeenCalledWith('seance1', [
        { date: '2026-08-01', slot: 'MORNING' },
        { date: '2026-08-02', slot: 'MORNING' },
      ]);
    });

    it('soumission réussie avec seanceId → émet created, toast affiché', async () => {
      const { fixture, scenariosSvc, snack } = await createComponent(2, 'seance1');
      const comp = fixture.componentInstance as any;
      comp.toggleSlot(0);
      comp.toggleSlot(1);
      fixture.detectChanges();
      const createdValues: any[] = [];
      fixture.componentInstance.created.subscribe((v: any) => createdValues.push(v));

      await comp.onSubmit();

      expect(scenariosSvc.createSeancePoll).toHaveBeenCalledTimes(1);
      expect(createdValues).toHaveLength(1);
      expect(snack.open).toHaveBeenCalledWith('Vote créé !', undefined, { duration: 3000 });
    });

    it('soumission en erreur (panne réseau) → error non-null, saving false, formulaire intact', async () => {
      const { fixture, scenariosSvc } = await createComponent(2, 'seance1');
      scenariosSvc.createSeancePoll.mockRejectedValueOnce(new Error('network'));
      const comp = fixture.componentInstance as any;
      comp.toggleSlot(0);
      comp.toggleSlot(1);
      fixture.detectChanges();

      await comp.onSubmit();

      expect(comp.error()).toBe('Impossible de créer le vote. Réessayez.');
      expect(comp.saving()).toBe(false);
      expect(comp.checkedSlots().size).toBe(2);
    });

    it('vote créé mais introuvable dans la séance retournée (désync) → message distinct, pas d’invitation à réessayer (revue de code)', async () => {
      const { fixture, scenariosSvc } = await createComponent(2, 'seance1');
      scenariosSvc.createSeancePoll.mockResolvedValueOnce({
        id: 's1',
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        closedAt: null,
        seances: [], // désync : la séance attendue n'y figure pas
      });
      const comp = fixture.componentInstance as any;
      comp.toggleSlot(0);
      comp.toggleSlot(1);
      fixture.detectChanges();

      await comp.onSubmit();

      expect(comp.error()).toContain('a été créé');
      expect(comp.error()).not.toBe('Impossible de créer le vote. Réessayez.');
      expect(comp.saving()).toBe(false);
    });
  });
});
