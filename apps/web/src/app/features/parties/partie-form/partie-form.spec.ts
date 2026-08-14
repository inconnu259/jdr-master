import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { PartieDto, PartieKind, ScenarioDto } from '@master-jdr/shared';
import { PartieForm } from './partie-form';
import { PartiesService } from '../../../core/parties/parties.service';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

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

function scenario(over: Partial<ScenarioDto> = {}): ScenarioDto {
  return {
    id: 's1',
    partieId: 'p1',
    title: 'Le Marché aux Ombres',
    description: null,
    status: 'A_VENIR',
    dureeHeures: null,
    dureeSeances: null,
    resumeFin: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    closedAt: null,
    seances: [],
    retrospectiveNotes: [],
    ...over,
  } as ScenarioDto;
}

async function createComponent(
  editId: string | null = null,
  options: { partie?: Partial<PartieDto>; scenarios?: ScenarioDto[] } = {},
) {
  const partie = { ...PARTIE, ...options.partie };
  const partiesSvc = {
    get: vi.fn().mockResolvedValue(partie),
    create: vi.fn().mockResolvedValue({ ...partie, id: 'new-id' }),
    update: vi.fn().mockResolvedValue(partie),
    convertKind: vi.fn().mockResolvedValue(partie),
    setCoverImage: vi.fn().mockResolvedValue({ ...partie, coverImageVersion: 'v1' }),
    removeCoverImage: vi.fn().mockResolvedValue({ ...partie, coverImageVersion: null }),
  };
  const myPartiesSvc = { refreshMjParties: vi.fn().mockResolvedValue(undefined) };
  const scenariosSvc = {
    listAll: vi.fn().mockResolvedValue(options.scenarios ?? []),
  };

  await TestBed.configureTestingModule({
    imports: [PartieForm],
    providers: [
      provideAnimationsAsync(),
      // Vrai Router (patron my-characters.spec.ts) : ContextualNavService s'abonne à
      // `Router.events`, qu'un mock objet n'expose pas.
      provideRouter([]),
      { provide: PartiesService, useValue: partiesSvc },
      { provide: MyPartiesService, useValue: myPartiesSvc },
      { provide: ScenariosService, useValue: scenariosSvc },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => editId } } },
      },
    ],
  }).compileComponents();

  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(PartieForm);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, partiesSvc, myPartiesSvc, scenariosSvc, router };
}

describe('PartieForm', () => {
  it('propose les 3 types de partie, y compris la campagne épisodique', async () => {
    const { fixture } = await createComponent();
    const toggles = Array.from(
      fixture.nativeElement.querySelectorAll('mat-button-toggle'),
    ) as HTMLElement[];
    expect(toggles).toHaveLength(3);
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

  it('édition sans changement de type : aucune conversion déclenchée', async () => {
    const { fixture, partiesSvc } = await createComponent('p1');
    const comp = fixture.componentInstance as any;
    comp.form.patchValue({ name: 'Nouveau nom' });

    await comp.submit();

    expect(partiesSvc.convertKind).not.toHaveBeenCalled();
    expect(partiesSvc.update).toHaveBeenCalled();
  });

  describe('conversion de type (Story 29.14)', () => {
    it('AC11 — un type inatteignable est désactivé ET sa raison est visible', async () => {
      const { fixture } = await createComponent('p1', {
        scenarios: [scenario({ id: 's1' }), scenario({ id: 's2' })],
      });

      const oneShotToggle = Array.from(
        fixture.nativeElement.querySelectorAll('mat-button-toggle'),
      )[0] as HTMLElement;
      expect(oneShotToggle.classList.contains('mat-button-toggle-disabled')).toBe(true);

      const reasons = fixture.nativeElement.querySelectorAll('.kind-reason');
      expect(reasons.length).toBeGreaterThan(0);
      expect((reasons[0] as HTMLElement).textContent).toContain('2');
    });

    it('AC11 — à 1 scénario, aucun type n’est désactivé', async () => {
      const { fixture } = await createComponent('p1', {
        scenarios: [scenario({ id: 's1' })],
      });
      const disabled = fixture.nativeElement.querySelectorAll(
        'mat-button-toggle.mat-button-toggle-disabled',
      );
      expect(disabled).toHaveLength(0);
      expect(fixture.nativeElement.querySelectorAll('.kind-reason')).toHaveLength(0);
    });

    it('AC11 — partie clôturée : tous les autres types sont refusés, raison affichée', async () => {
      const { fixture } = await createComponent('p1', {
        partie: { status: 'TERMINEE' },
        scenarios: [scenario({ id: 's1' })],
      });
      const disabled = fixture.nativeElement.querySelectorAll(
        'mat-button-toggle.mat-button-toggle-disabled',
      );
      expect(disabled).toHaveLength(2); // les deux types autres que celui en cours
      expect(fixture.nativeElement.textContent).toMatch(/rouvr/i);
    });

    it('AC8 (révisé, revue de code du 2026-08-14) — l’enregistrement des autres champs passe AVANT la conversion', async () => {
      // Ordre inversé par rapport à la version initiale : convertKind() lit partie.name côté
      // serveur — l'exécuter en premier titrerait un scénario auto-créé (AC7) avec un nom déjà
      // périmé si le MJ renomme ET convertit dans le même envoi.
      const { fixture, partiesSvc } = await createComponent('p1', {
        scenarios: [scenario({ id: 's1' })],
      });
      const comp = fixture.componentInstance as any;
      const order: string[] = [];
      partiesSvc.convertKind.mockImplementation(async () => {
        order.push('convert');
        return PARTIE;
      });
      partiesSvc.update.mockImplementation(async () => {
        order.push('update');
        return PARTIE;
      });

      comp.form.patchValue({ kind: 'ONE_SHOT' });
      await comp.submit();

      expect(order).toEqual(['update', 'convert']);
      expect(partiesSvc.convertKind).toHaveBeenCalledWith('p1', 'ONE_SHOT', undefined);
    });

    it('une conversion refusée laisse les autres champs déjà enregistrés (ordre révisé)', async () => {
      const { fixture, partiesSvc } = await createComponent('p1', {
        scenarios: [scenario({ id: 's1' })],
      });
      const comp = fixture.componentInstance as any;
      partiesSvc.convertKind.mockRejectedValue({
        error: { message: 'Cette partie compte 3 scénarios ; un one-shot n’en a qu’un' },
      });

      comp.form.patchValue({ kind: 'ONE_SHOT' });
      await comp.submit();

      expect(partiesSvc.update).toHaveBeenCalled();
    });

    it("une conversion refusée après l'enregistrement affiche un message distinguant les deux, jamais une navigation", async () => {
      const { fixture, partiesSvc, router } = await createComponent('p1', {
        scenarios: [scenario({ id: 's1' })],
      });
      const comp = fixture.componentInstance as any;
      partiesSvc.convertKind.mockRejectedValue({
        error: { message: 'Cette partie compte 3 scénarios ; un one-shot n’en a qu’un' },
      });

      comp.form.patchValue({ kind: 'ONE_SHOT' });
      await comp.submit();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(comp.savedKind()).not.toBe('ONE_SHOT');
    });

    it('AC15 — le message de refus du serveur est relayé tel quel, jamais masqué', async () => {
      const { fixture, partiesSvc } = await createComponent('p1', {
        scenarios: [scenario({ id: 's1' })],
      });
      const comp = fixture.componentInstance as any;
      partiesSvc.convertKind.mockRejectedValue({
        error: { message: 'Cette partie compte 3 scénarios ; un one-shot n’en a qu’un' },
      });

      comp.form.patchValue({ kind: 'ONE_SHOT' });
      await comp.submit();

      expect(comp.error()).toContain('3 scénarios');
    });

    it("sans message serveur, une conversion refusée après l'enregistrement affiche un message distinct (autres champs enregistrés, type non changé)", async () => {
      const { fixture, partiesSvc } = await createComponent('p1', {
        scenarios: [scenario({ id: 's1' })],
      });
      const comp = fixture.componentInstance as any;
      partiesSvc.convertKind.mockRejectedValue(new Error('network'));

      comp.form.patchValue({ kind: 'ONE_SHOT' });
      await comp.submit();

      expect(comp.error()).toMatch(/enregistr/i);
    });

    it('AC9 — deux scénarios COURANT : l’arbitrage est demandé AVANT toute soumission', async () => {
      const { fixture, partiesSvc } = await createComponent('p1', {
        scenarios: [
          scenario({ id: 's1', status: 'COURANT', title: 'Premier' }),
          scenario({ id: 's2', status: 'COURANT', title: 'Second' }),
        ],
      });
      const comp = fixture.componentInstance as any;

      comp.form.patchValue({ kind: 'CAMPAGNE_LINEAIRE' });
      await comp.submit();
      fixture.detectChanges();

      expect(partiesSvc.convertKind).not.toHaveBeenCalled();
      expect(comp.courantChoice()).not.toBeNull();
      expect(fixture.nativeElement.querySelectorAll('mat-radio-button')).toHaveLength(2);
    });

    it('AC9 — le scénario désigné est transmis à la conversion', async () => {
      const { fixture, partiesSvc } = await createComponent('p1', {
        scenarios: [
          scenario({ id: 's1', status: 'COURANT' }),
          scenario({ id: 's2', status: 'COURANT' }),
        ],
      });
      const comp = fixture.componentInstance as any;

      comp.form.patchValue({ kind: 'CAMPAGNE_LINEAIRE' });
      await comp.submit();
      comp.chosenCourantId.set('s2');
      await comp.submit();

      expect(partiesSvc.convertKind).toHaveBeenCalledWith('p1', 'CAMPAGNE_LINEAIRE', 's2');
    });

    it('AC9 — un seul COURANT : aucun arbitrage, conversion directe', async () => {
      const { fixture, partiesSvc } = await createComponent('p1', {
        scenarios: [
          scenario({ id: 's1', status: 'COURANT' }),
          scenario({ id: 's2', status: 'A_VENIR' }),
        ],
      });
      const comp = fixture.componentInstance as any;

      comp.form.patchValue({ kind: 'CAMPAGNE_LINEAIRE' });
      await comp.submit();

      expect(comp.courantChoice()).toBeNull();
      expect(partiesSvc.convertKind).toHaveBeenCalledWith('p1', 'CAMPAGNE_LINEAIRE', undefined);
    });

    it('un échec de chargement des scénarios ne bloque pas l’édition — le serveur reste l’autorité', async () => {
      const scenariosSvc = { listAll: vi.fn().mockRejectedValue(new Error('boom')) };
      await TestBed.configureTestingModule({
        imports: [PartieForm],
        providers: [
          provideAnimationsAsync(),
          provideRouter([]),
          {
            provide: PartiesService,
            useValue: {
              get: vi.fn().mockResolvedValue(PARTIE),
              update: vi.fn().mockResolvedValue(PARTIE),
              convertKind: vi.fn(),
              create: vi.fn(),
              setCoverImage: vi.fn(),
              removeCoverImage: vi.fn(),
            },
          },
          { provide: MyPartiesService, useValue: { refreshMjParties: vi.fn() } },
          { provide: ScenariosService, useValue: scenariosSvc },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(PartieForm);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelectorAll('mat-button-toggle.mat-button-toggle-disabled'),
      ).toHaveLength(0);
    });
  });

  describe('image de couverture (Story 29.12 AC1/AC3, étendue par 29.14)', () => {
    function fileEvent(file: File) {
      return { target: { files: [file], value: '' } } as unknown as Event;
    }

    const validFile = () => new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' });

    it('AC3 — la section couverture est présente DÈS la création', async () => {
      const { fixture } = await createComponent(null);
      expect(fixture.nativeElement.querySelector('.cover-section')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-party-banner')).not.toBeNull();
    });

    it('édition : la section couverture s’affiche, la bannière de partie est rendue', async () => {
      const { fixture } = await createComponent('p1');
      expect(fixture.nativeElement.querySelector('.cover-section')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-party-banner')).not.toBeNull();
    });

    it('édition — dépôt : appelle setCoverImage(id, file), coverImageVersion() reflète le résultat', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      const file = validFile();

      await comp.onCoverFileSelected(fileEvent(file));

      expect(partiesSvc.setCoverImage).toHaveBeenCalledWith('p1', file);
      expect(comp.coverImageVersion()).toBe('v1');
    });

    it('Review Findings 29.12 : un second dépôt pendant coverSaving() est ignoré', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      comp.coverSaving.set(true);

      await comp.onCoverFileSelected(fileEvent(validFile()));

      expect(partiesSvc.setCoverImage).not.toHaveBeenCalled();
    });

    it('Review Findings 29.12 : un second retrait pendant coverSaving() est ignoré', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      comp.coverSaving.set(true);

      await comp.removeCoverImage();

      expect(partiesSvc.removeCoverImage).not.toHaveBeenCalled();
    });

    it('édition — retrait : appelle removeCoverImage(id), coverImageVersion() redevient null', async () => {
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

      await comp.onCoverFileSelected(fileEvent(validFile()));
      fixture.detectChanges();

      expect(comp.coverError()).not.toBeNull();
      expect(comp.coverImageVersion()).toBeNull();
    });

    it('AC12 — création : la partie est créée PUIS l’image déposée sur son identifiant', async () => {
      const { fixture, partiesSvc } = await createComponent(null);
      const comp = fixture.componentInstance as any;
      const file = validFile();

      await comp.onCoverFileSelected(fileEvent(file));
      expect(partiesSvc.setCoverImage).not.toHaveBeenCalled(); // rien à cibler encore

      comp.form.patchValue({ name: 'Ma partie', gameSystemId: 'draconis', kind: 'ONE_SHOT' });
      await comp.submit();

      expect(partiesSvc.create).toHaveBeenCalled();
      expect(partiesSvc.setCoverImage).toHaveBeenCalledWith('new-id', file);
    });

    it('AC12 — si le dépôt échoue après création, le message ne prétend JAMAIS que la partie a échoué', async () => {
      const { fixture, partiesSvc, router } = await createComponent(null);
      const comp = fixture.componentInstance as any;
      partiesSvc.setCoverImage.mockRejectedValueOnce(new Error('boom'));

      await comp.onCoverFileSelected(fileEvent(validFile()));
      comp.form.patchValue({ name: 'Ma partie', gameSystemId: 'draconis', kind: 'ONE_SHOT' });
      await comp.submit();

      expect(comp.error()).toMatch(/bien (inscrit|tracé|enregistrée)/i);
      expect(router.navigate).not.toHaveBeenCalled();
      // La partie existe : le formulaire bascule en mode édition sur son identifiant.
      expect(comp.editId()).toBe('new-id');
    });

    it('AC14 — un type non accepté est rejeté AVANT tout envoi réseau', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      const pdf = new File(['bytes'], 'doc.pdf', { type: 'application/pdf' });

      await comp.onCoverFileSelected(fileEvent(pdf));

      expect(partiesSvc.setCoverImage).not.toHaveBeenCalled();
      expect(comp.coverError()).not.toBeNull();
    });

    it('AC14 — un fichier de plus de 5 Mo est rejeté AVANT tout envoi réseau', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
      Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });

      await comp.onCoverFileSelected(fileEvent(big));

      expect(partiesSvc.setCoverImage).not.toHaveBeenCalled();
      expect(comp.coverError()).not.toBeNull();
    });

    it('AC14 — un fichier exactement au plafond est accepté (borne inclusive, comme le serveur)', async () => {
      const { fixture, partiesSvc } = await createComponent('p1');
      const comp = fixture.componentInstance as any;
      const atLimit = new File(['x'], 'limit.jpg', { type: 'image/jpeg' });
      Object.defineProperty(atLimit, 'size', { value: 5 * 1024 * 1024 });

      await comp.onCoverFileSelected(fileEvent(atLimit));

      expect(partiesSvc.setCoverImage).toHaveBeenCalled();
    });

    it('AC13 — un indicateur de progression est visible pendant le dépôt', async () => {
      const { fixture } = await createComponent('p1');
      const comp = fixture.componentInstance as any;

      comp.coverSaving.set(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('mat-progress-bar')).not.toBeNull();
    });
  });
});
