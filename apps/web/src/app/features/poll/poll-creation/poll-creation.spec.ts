import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { PollCreationComponent } from './poll-creation';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

function makePollService() {
  return {
    createPoll: vi.fn().mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
      scenarioRef: null,
      expiresAt: null,
      chosenDate: null,
      chosenSlot: null,
      options: [],
    }),
  };
}

function makeThemeService() {
  return { tone: () => ({ 'success.poll_created': 'Vote créé !' }) };
}

function makeSnackBar() {
  return { open: vi.fn() };
}

async function createComponent(preselectedCount = 0) {
  const pollSvc = makePollService();
  const snack = makeSnackBar();
  await TestBed.configureTestingModule({
    imports: [PollCreationComponent],
    providers: [
      provideAnimationsAsync(),
      { provide: PollService, useValue: pollSvc },
      { provide: ThemeToneService, useValue: makeThemeService() },
      { provide: MatSnackBar, useValue: snack },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PollCreationComponent);
  fixture.componentRef.setInput('partieId', 'p1');
  const slots = Array.from({ length: preselectedCount }, (_, i) => ({
    date: `2026-08-0${i + 1}`,
    slot: 'MORNING' as const,
    members: [{ userId: 'u1', pseudo: 'Alice', status: 'AVAILABLE' as const }],
  }));
  fixture.componentRef.setInput('preselectedSlots', slots);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, pollSvc, snack };
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
    const { fixture, pollSvc } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0); // 2026-08-01, MORNING
    comp.toggleSlot(1); // 2026-08-02, MORNING
    comp.customSlots.set([{ date: '2026-08-01', slot: 'MORNING' }]); // doublon exact de l'index 0
    fixture.detectChanges();
    expect(comp.totalSelected()).toBe(3); // avant dédoublonnage : 2 cochés + 1 personnalisé

    await comp.onSubmit();

    expect(pollSvc.createPoll).toHaveBeenCalledTimes(1);
    const dto = pollSvc.createPoll.mock.calls[0][1];
    expect(dto.options).toHaveLength(2);
    expect(dto.options).toEqual([
      { date: '2026-08-01', slot: 'MORNING' },
      { date: '2026-08-02', slot: 'MORNING' },
    ]);
  });

  it('soumission réussie → émet created, toast affiché', async () => {
    const { fixture, pollSvc, snack } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0);
    comp.toggleSlot(1);
    fixture.detectChanges();
    const createdValues: any[] = [];
    fixture.componentInstance.created.subscribe((v: any) => createdValues.push(v));
    await comp.onSubmit();
    expect(pollSvc.createPoll).toHaveBeenCalledTimes(1);
    expect(createdValues).toHaveLength(1);
    expect(snack.open).toHaveBeenCalledWith('Vote créé !', undefined, { duration: 3000 });
    expect(comp.saving()).toBe(false);
  });

  it('soumission en erreur → error non-null, saving false, formulaire intact', async () => {
    const { fixture, pollSvc } = await createComponent(2);
    pollSvc.createPoll.mockRejectedValue(new Error('network'));
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0);
    comp.toggleSlot(1);
    fixture.detectChanges();
    await comp.onSubmit();
    expect(comp.error()).not.toBeNull();
    expect(comp.saving()).toBe(false);
    expect(comp.checkedSlots().size).toBe(2);
  });
});
