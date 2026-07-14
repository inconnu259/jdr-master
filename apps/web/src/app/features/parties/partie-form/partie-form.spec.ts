import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { PartieDto, PartieKind } from '@master-jdr/shared';
import { PartieForm } from './partie-form';
import { PartiesService } from '../../../core/parties/parties.service';
import { ModeService } from '../../../core/mode/mode.service';

const PARTIE: PartieDto = {
  id: 'p1',
  name: 'La Guilde des Ombres',
  kind: 'CAMPAGNE_EPISODIQUE',
  gameSystemId: 'draconis',
  description: null,
  mjId: 'mj1',
  createdAt: '2026-07-01T00:00:00.000Z',
  nextSessionDate: null,
  nextSessionSlot: null,
};

async function createComponent(editId: string | null = null) {
  const partiesSvc = {
    get: vi.fn().mockResolvedValue(PARTIE),
    create: vi.fn().mockResolvedValue({ ...PARTIE, id: 'new-id' }),
    update: vi.fn().mockResolvedValue(PARTIE),
  };
  const modeSvc = { refreshMjParties: vi.fn().mockResolvedValue(undefined), setMode: vi.fn() };
  const router = { navigate: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [PartieForm],
    providers: [
      provideAnimationsAsync(),
      { provide: PartiesService, useValue: partiesSvc },
      { provide: ModeService, useValue: modeSvc },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => editId } } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PartieForm);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, partiesSvc, modeSvc, router };
}

describe('PartieForm', () => {
  it('propose les 3 types de partie, y compris Campagne épisodique', async () => {
    const { fixture } = await createComponent();
    const toggles = Array.from(
      fixture.nativeElement.querySelectorAll('mat-button-toggle'),
    ) as HTMLElement[];
    const labels = toggles.map((t) => t.textContent?.trim());
    expect(labels).toContain('One-shot');
    expect(labels).toContain('Campagne');
    expect(labels).toContain('Campagne épisodique');
  });

  it.each(['ONE_SHOT', 'CAMPAGNE_LINEAIRE', 'CAMPAGNE_EPISODIQUE'] as PartieKind[])(
    'création : soumettre avec kind=%s appelle create() avec ce kind exact',
    async (kind) => {
      const { fixture, partiesSvc } = await createComponent();
      const comp = fixture.componentInstance as any;
      comp.form.patchValue({ name: 'Ma partie', gameSystemId: 'draconis', kind });
      await comp.submit();
      expect(partiesSvc.create).toHaveBeenCalledWith(expect.objectContaining({ kind }));
    },
  );

  it('édition d’une Partie CAMPAGNE_EPISODIQUE : le formulaire pré-remplit kind sans le rabattre sur CAMPAGNE_LINEAIRE', async () => {
    const { fixture, partiesSvc } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    expect(comp.form.value.kind).toBe('CAMPAGNE_EPISODIQUE');

    await comp.submit();
    expect(partiesSvc.update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ kind: 'CAMPAGNE_EPISODIQUE' }),
    );
  });
});
