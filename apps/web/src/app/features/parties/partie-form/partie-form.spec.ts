import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { PartieDto, PartieKind } from '@master-jdr/shared';
import { PartieForm } from './partie-form';
import { PartiesService } from '../../../core/parties/parties.service';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';

const PARTIE: PartieDto = {
  id: 'p1',
  name: 'La Guilde des Ombres',
  kind: 'CAMPAGNE_EPISODIQUE',
  gameSystemId: 'draconis',
  description: null,
  mjId: 'mj1',
  mjPseudo: 'mj-pseudo',
  mjDisplayName: 'MJ Nom',
  createdAt: '2026-07-01T00:00:00.000Z',
  nextSessionDate: null,
  nextSessionSlot: null,
  role: 'mj',
  status: 'A_VENIR',
  isFavorite: false,
  coverImageVersion: null,
};

async function createComponent(editId: string | null = null) {
  const partiesSvc = {
    get: vi.fn().mockResolvedValue(PARTIE),
    create: vi.fn().mockResolvedValue({ ...PARTIE, id: 'new-id' }),
    update: vi.fn().mockResolvedValue(PARTIE),
    setCoverImage: vi.fn().mockResolvedValue({ ...PARTIE, coverImageVersion: 'v1' }),
    removeCoverImage: vi.fn().mockResolvedValue({ ...PARTIE, coverImageVersion: null }),
  };
  const myPartiesSvc = { refreshMjParties: vi.fn().mockResolvedValue(undefined) };
  const router = { navigate: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [PartieForm],
    providers: [
      provideAnimationsAsync(),
      { provide: PartiesService, useValue: partiesSvc },
      { provide: MyPartiesService, useValue: myPartiesSvc },
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
  return { fixture, partiesSvc, myPartiesSvc, router };
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

  it('création : appelle refreshMjParties() après succès (Story 29.1, setMode disparu)', async () => {
    const { fixture, myPartiesSvc } = await createComponent();
    const comp = fixture.componentInstance as any;
    comp.form.patchValue({ name: 'Ma partie', gameSystemId: 'draconis', kind: 'ONE_SHOT' });
    await comp.submit();
    expect(myPartiesSvc.refreshMjParties).toHaveBeenCalledTimes(1);
  });

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

  describe('image de couverture (Story 29.12, AC1/AC3)', () => {
    it('création (aucun editId) : la section couverture ne s’affiche pas — pas encore d’identifiant à cibler', async () => {
      const { fixture } = await createComponent(null);
      expect(fixture.nativeElement.querySelector('.cover-section')).toBeNull();
    });

    it('édition : la section couverture s’affiche, la bannière de partie est rendue', async () => {
      const { fixture } = await createComponent('p1');
      expect(fixture.nativeElement.querySelector('.cover-section')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-party-banner')).not.toBeNull();
    });

    it('dépôt : appelle PartiesService.setCoverImage(id, file), coverImageVersion() reflète le résultat', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      const file = new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });
      const event = { target: { files: [file], value: '' } };

      await comp.onCoverFileSelected(event);

      expect(partiesSvc.setCoverImage).toHaveBeenCalledWith('p1', file);
      expect(comp.coverImageVersion()).toBe('v1');
    });

    it('Review Findings : un second dépôt déclenché pendant que coverSaving() est vrai est ignoré (garde anti-double-clic)', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      comp.coverSaving.set(true);
      const file = new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });

      await comp.onCoverFileSelected({ target: { files: [file], value: '' } });

      expect(partiesSvc.setCoverImage).not.toHaveBeenCalled();
    });

    it('Review Findings : un second retrait déclenché pendant que coverSaving() est vrai est ignoré (garde anti-double-clic)', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      comp.coverSaving.set(true);

      await comp.removeCoverImage();

      expect(partiesSvc.removeCoverImage).not.toHaveBeenCalled();
    });

    it('retrait : appelle PartiesService.removeCoverImage(id), coverImageVersion() redevient null', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      comp.coverImageVersion.set('v1');

      await comp.removeCoverImage();

      expect(partiesSvc.removeCoverImage).toHaveBeenCalledWith('p1');
      expect(comp.coverImageVersion()).toBeNull();
    });

    it('échec du dépôt → message d’erreur affiché, coverImageVersion() inchangé', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      partiesSvc.setCoverImage.mockRejectedValueOnce(new Error('boom'));
      const comp = fixture.componentInstance as any;
      const file = new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });

      await comp.onCoverFileSelected({ target: { files: [file], value: '' } });
      fixture.detectChanges();

      expect(comp.coverError()).not.toBeNull();
      expect(comp.coverImageVersion()).toBeNull();
    });
  });
});
