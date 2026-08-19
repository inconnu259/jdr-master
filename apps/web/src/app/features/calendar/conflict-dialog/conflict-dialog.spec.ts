import '@angular/compiler';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ConflictDialog, type ConflictDialogData } from './conflict-dialog';

function makeData(overrides: Partial<ConflictDialogData> = {}): ConflictDialogData {
  return {
    kindLabel: 'disponible',
    intentLabel: 'du 3 au 9 août, le soir',
    conflicts: [
      { batchIndex: 1, label: 'Mar 4 août · Soir' },
      { batchIndex: 4, label: 'Ven 7 août · Soir' },
      { batchIndex: 6, label: 'Dim 9 août · Soir' },
    ],
    freeCount: 4,
    seanceExceptions: [],
    ...overrides,
  };
}

async function createComponent(data: ConflictDialogData) {
  const dialogRef = { close: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [ConflictDialog],
    providers: [
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ConflictDialog);
  fixture.detectChanges();
  return { fixture, dialogRef, el: fixture.nativeElement as HTMLElement };
}

describe('ConflictDialog (Story 36.4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC1 : les trois issues sont proposées, et le lot n’est pas refusé', async () => {
    const { el } = await createComponent(makeData());
    const labels = [...el.querySelectorAll('.choice__label')].map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Remplacer', 'Conserver', 'Au cas par cas']);
  });

  it('AC2 : le dialogue NOMME les créneaux concernés, il ne se contente pas de les compter', async () => {
    const { el } = await createComponent(makeData());
    const text = el.textContent ?? '';
    expect(text).toContain('Mar 4 août · Soir');
    expect(text).toContain('Ven 7 août · Soir');
    expect(text).toContain('Dim 9 août · Soir');
  });

  it('AC2 : le titre compte les créneaux, et l’intention du geste est rappelée', async () => {
    const { el } = await createComponent(makeData());
    expect(el.querySelector('[mat-dialog-title]')?.textContent).toContain(
      '3 créneaux sont déjà déclarés',
    );
    expect(el.textContent).toContain('du 3 au 9 août, le soir');
  });

  it('« Remplacer » ferme le dialogue avec une décision overwrite pour CHAQUE créneau en conflit', async () => {
    const { el, dialogRef } = await createComponent(makeData());
    el.querySelector<HTMLButtonElement>('[data-test="choice-overwrite"]')!.click();
    expect(dialogRef.close).toHaveBeenCalledWith({
      1: 'overwrite',
      4: 'overwrite',
      6: 'overwrite',
    });
  });

  it('« Conserver » ferme le dialogue avec une décision keep pour chaque créneau en conflit', async () => {
    const { el, dialogRef } = await createComponent(makeData());
    el.querySelector<HTMLButtonElement>('[data-test="choice-keep"]')!.click();
    expect(dialogRef.close).toHaveBeenCalledWith({ 1: 'keep', 4: 'keep', 6: 'keep' });
  });

  it('AC3 : « Au cas par cas » déroule les conflits un par un, chaque décision ne portant que sur son créneau', async () => {
    const { fixture, el, dialogRef } = await createComponent(makeData());
    el.querySelector<HTMLButtonElement>('[data-test="choice-walkthrough"]')!.click();
    fixture.detectChanges();

    // 1er conflit : Remplacer
    expect(el.textContent).toContain('1 / 3');
    expect(el.textContent).toContain('Mar 4 août · Soir');
    el.querySelector<HTMLButtonElement>('[data-test="step-overwrite"]')!.click();
    fixture.detectChanges();

    // 2e conflit : Conserver
    expect(el.textContent).toContain('2 / 3');
    el.querySelector<HTMLButtonElement>('[data-test="step-keep"]')!.click();
    fixture.detectChanges();

    // 3e conflit : Remplacer — la dernière décision referme le dialogue
    expect(el.textContent).toContain('3 / 3');
    el.querySelector<HTMLButtonElement>('[data-test="step-overwrite"]')!.click();

    expect(dialogRef.close).toHaveBeenCalledWith({ 1: 'overwrite', 4: 'keep', 6: 'overwrite' });
  });

  it('AC3 : un même créneau en conflit avec deux déclarations ne demande qu’UNE décision', async () => {
    const { fixture, el, dialogRef } = await createComponent(
      makeData({
        conflicts: [
          { batchIndex: 2, label: 'Mer 5 août · Soir' },
          { batchIndex: 2, label: 'Mer 5 août · Soir' },
        ],
        freeCount: 0,
      }),
    );
    el.querySelector<HTMLButtonElement>('[data-test="choice-walkthrough"]')!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('1 / 1');
    el.querySelector<HTMLButtonElement>('[data-test="step-keep"]')!.click();
    expect(dialogRef.close).toHaveBeenCalledWith({ 2: 'keep' });
  });

  it('AC10 : fermer sans choisir n’enregistre rien — le résultat est null', async () => {
    const { el, dialogRef } = await createComponent(makeData());
    el.querySelector<HTMLButtonElement>('[data-test="cancel"]')!.click();
    expect(dialogRef.close).toHaveBeenCalledWith(null);
  });

  it('AC10 : abandonner EN COURS de défilé n’enregistre aucune des décisions déjà prises', async () => {
    const { fixture, el, dialogRef } = await createComponent(makeData());
    el.querySelector<HTMLButtonElement>('[data-test="choice-walkthrough"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-test="step-overwrite"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-test="cancel"]')!.click();
    expect(dialogRef.close).toHaveBeenCalledWith(null);
  });

  it('AC11 : la ligne d’exception « séance » est affichée, distincte des choix, et non actionnable', async () => {
    const { el } = await createComponent(makeData({ seanceExceptions: ['Sam 8 août · Soir'] }));
    const exception = el.querySelector('.exception');
    expect(exception).not.toBeNull();
    expect(exception!.textContent).toContain('Sam 8 août · Soir');
    expect(exception!.textContent).toContain('séance');
    expect(exception!.querySelector('button')).toBeNull();
  });

  it('AC11 : sans créneau couvert par une séance, aucune ligne d’exception n’est réservée', async () => {
    const { el } = await createComponent(makeData());
    expect(el.querySelector('.exception')).toBeNull();
  });

  it('AC15 : chaque choix est distingué par son libellé, jamais par la seule couleur', async () => {
    const { el } = await createComponent(makeData());
    for (const id of ['choice-overwrite', 'choice-keep', 'choice-walkthrough']) {
      const btn = el.querySelector<HTMLButtonElement>(`[data-test="${id}"]`)!;
      expect(btn.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('AC15 : l’avancement du défilé est annoncé en toutes lettres dans une région live', async () => {
    const { fixture, el } = await createComponent(makeData());
    el.querySelector<HTMLButtonElement>('[data-test="choice-walkthrough"]')!.click();
    fixture.detectChanges();
    const live = el.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live!.textContent).toContain('Mar 4 août · Soir');
  });

  it('un seul créneau en conflit → le titre est au singulier', async () => {
    const { el } = await createComponent(
      makeData({ conflicts: [{ batchIndex: 0, label: 'Lun 3 août · Soir' }], freeCount: 0 }),
    );
    expect(el.querySelector('[mat-dialog-title]')?.textContent).toContain(
      '1 créneau est déjà déclaré',
    );
  });

  it('« Conserver » annonce ce qu’il advient des créneaux SANS conflit', async () => {
    const { el } = await createComponent(makeData());
    expect(el.textContent).toContain('Les 4 autres passent en disponible');
  });

  it('« Conserver » accorde au singulier quand un seul créneau est libre (revue de code)', async () => {
    const { el } = await createComponent(makeData({ freeCount: 1 }));
    expect(el.textContent).toContain('Le 1 autre passe en disponible');
    expect(el.textContent).not.toContain('Les 1 autres');
  });

  describe('AC15 : rôle de dialogue et gestion du focus — montage RÉEL via MatDialog.open() (revue de code)', () => {
    // Les tests ci-dessus mockent MatDialogRef/MAT_DIALOG_DATA directement : ils contournent le
    // CDK et ne prouvent donc rien sur le rôle ou le piège de focus effectivement posés. La story
    // dit explicitement « le vérifier, pas le supposer » — ces deux tests ouvrent le VRAI
    // MatDialog pour vérifier ce que le CDK est censé fournir gratuitement.
    afterEach(() => TestBed.resetTestingModule());

    async function flush(appRef: ApplicationRef) {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        appRef.tick();
      }
    }

    async function openRealDialog(data: ConflictDialogData) {
      await TestBed.configureTestingModule({
        providers: [provideNoopAnimations()],
      }).compileComponents();
      const appRef = TestBed.inject(ApplicationRef);
      const dialog = TestBed.inject(MatDialog);
      const ref = dialog.open(ConflictDialog, { data });
      await flush(appRef);
      return { appRef, ref };
    }

    it('le conteneur CDK expose role="dialog" et prend le focus à l’ouverture', async () => {
      const { ref } = await openRealDialog(makeData());
      const container = document.querySelector('mat-dialog-container') as HTMLElement | null;
      expect(container).not.toBeNull();
      expect(container!.getAttribute('role')).toBe('dialog');
      expect(container!.contains(document.activeElement)).toBe(true);
      ref.close(null);
    });

    it('le focus est rendu à sa fermeture', async () => {
      const trigger = document.createElement('button');
      document.body.appendChild(trigger);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      const { appRef, ref } = await openRealDialog(makeData());
      expect(document.activeElement).not.toBe(trigger);

      ref.close(null);
      await flush(appRef);

      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    });
  });
});
