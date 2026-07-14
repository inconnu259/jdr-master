import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import type { ScenarioDto, SeanceDto, SessionPollDto } from '@master-jdr/shared';
import { SeanceList } from './seance-list';
import { AuthService } from '../../../core/auth/auth.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { PollService } from '../../../core/poll/poll.service';

const POLL: SessionPollDto = {
  id: 'poll1',
  partieId: 'p1',
  status: 'OPEN',
  scenarioRef: null,
  expiresAt: null,
  chosenDate: null,
  chosenSlot: null,
  options: [],
};

const SEANCE_NO_POLL: SeanceDto = {
  id: 'seance1',
  scenarioId: 's1',
  compteRendu: null,
  createdAt: '2026-07-13T00:00:00.000Z',
};

const SEANCE_WITH_POLL: SeanceDto = {
  ...SEANCE_NO_POLL,
  poll: POLL,
};

const SCENARIO: ScenarioDto = {
  id: 's1',
  partieId: 'p1',
  title: 'Chapitre 1',
  description: null,
  status: 'COURANT',
  dureeHeures: null,
  dureeSeances: 3,
  resumeFin: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  closedAt: null,
  seances: [],
};

async function createComponent(
  scenario: ScenarioDto,
  {
    isMj = false,
    isEpisodique = false,
    currentUserId = 'u1',
  }: {
    isMj?: boolean;
    isEpisodique?: boolean;
    currentUserId?: string;
  } = {},
) {
  const scenariosSvc = {
    createSeancePoll: vi.fn(),
    deleteSeance: vi.fn(),
    resetSeanceDate: vi.fn(),
    listAll: vi.fn().mockResolvedValue([scenario]),
    setSeanceCapacity: vi.fn(),
    inscrire: vi.fn(),
    desinscrire: vi.fn(),
    setCompteRendu: vi.fn(),
  };
  const pollSvc = {
    chooseDate: vi.fn(),
    closePoll: vi.fn(),
  };
  const authSvc = { currentUser: () => ({ id: currentUserId }) };
  const router = { navigate: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [SeanceList],
    providers: [
      provideAnimationsAsync(),
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: PollService, useValue: pollSvc },
      { provide: AuthService, useValue: authSvc },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(SeanceList);
  fixture.componentRef.setInput('scenario', scenario);
  fixture.componentRef.setInput('partieId', 'p1');
  fixture.componentRef.setInput('isMj', isMj);
  fixture.componentRef.setInput('isEpisodique', isEpisodique);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, scenariosSvc, pollSvc, router };
}

describe('SeanceList', () => {
  it('numérote chaque séance dans l’ordre (« Séance 1 », « Séance 2 »…)', async () => {
    const seance2: SeanceDto = { ...SEANCE_NO_POLL, id: 'seance2' };
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL, seance2] },
      { isMj: true },
    );
    const titles = Array.from(fixture.nativeElement.querySelectorAll('.seance-row__title')).map(
      (el: any) => el.textContent.trim(),
    );
    expect(titles).toEqual(['Séance 1', 'Séance 2']);
  });

  it('MJ, séance sans poll → bouton "Lancer le vote" visible', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: true },
    );
    expect(fixture.nativeElement.textContent).toContain('Lancer le vote');
    expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
  });

  it('MJ, clic sur "Lancer le vote" → navigue vers le calendrier avec seanceId en queryParam (Story 8.7, AC2/AC3)', async () => {
    const { fixture, router } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: true },
    );
    const btn: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((b: any) => b.textContent.includes('Lancer le vote')) as HTMLButtonElement;
    btn.click();

    expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'calendar'], {
      queryParams: { seanceId: 'seance1' },
    });
  });

  it('MJ, séance avec poll → app-poll-status + members visibles', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
      { isMj: true },
    );
    expect(fixture.nativeElement.querySelector('app-poll-status')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
  });

  it('joueur, séance avec poll → app-poll-response visible', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
      { isMj: false },
    );
    expect(fixture.nativeElement.querySelector('app-poll-response')).toBeTruthy();
  });

  it('joueur, séance sans poll → rien affiché pour cette séance', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: false },
    );
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poll-response')).toBeNull();
  });

  describe('onChoose()/onClosePoll() rafraîchissent l’affichage (bug-fix : « rien ne se passe » après avoir scellé un créneau)', () => {
    it('onChoose appelle chooseDate PUIS recharge le scénario et émet seanceLinked', async () => {
      const { fixture, scenariosSvc, pollSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
        { isMj: true },
      );
      const comp = fixture.componentInstance as any;
      const closedPoll: SessionPollDto = {
        ...POLL,
        status: 'CLOSED',
        chosenDate: '2026-08-01T00:00:00.000Z',
        chosenSlot: 'EVENING',
      };
      const fresh = { ...SCENARIO, seances: [{ ...SEANCE_WITH_POLL, poll: closedPoll }] };
      scenariosSvc.listAll.mockResolvedValue([fresh]);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onChoose('poll1', 'opt1');

      expect(pollSvc.chooseDate).toHaveBeenCalledWith('p1', 'poll1', { optionId: 'opt1' });
      expect(scenariosSvc.listAll).toHaveBeenCalledWith('p1');
      expect(emitted).toEqual(fresh);
    });

    it('onClosePoll appelle closePoll PUIS recharge le scénario et émet seanceLinked', async () => {
      const { fixture, scenariosSvc, pollSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
        { isMj: true },
      );
      const comp = fixture.componentInstance as any;
      const closedPoll: SessionPollDto = { ...POLL, status: 'CLOSED' };
      const fresh = { ...SCENARIO, seances: [{ ...SEANCE_WITH_POLL, poll: closedPoll }] };
      scenariosSvc.listAll.mockResolvedValue([fresh]);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onClosePoll('poll1');

      expect(pollSvc.closePoll).toHaveBeenCalledWith('p1', 'poll1');
      expect(emitted).toEqual(fresh);
    });
  });

  describe('Poll clôturé : date retenue affichée (bug-fix : aucune indication de la date choisie)', () => {
    const CLOSED_WITH_DATE: SeanceDto = {
      ...SEANCE_NO_POLL,
      poll: {
        ...POLL,
        status: 'CLOSED',
        chosenDate: '2026-08-01T00:00:00.000Z',
        chosenSlot: 'EVENING',
      },
    };
    const CLOSED_NO_DATE: SeanceDto = {
      ...SEANCE_NO_POLL,
      poll: { ...POLL, status: 'CLOSED' },
    };

    it('MJ, poll CLOSED avec chosenDate → affiche "Date retenue", plus de app-poll-status', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_WITH_DATE] },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
    });

    it('joueur, poll CLOSED avec chosenDate → affiche "Date retenue", plus de app-poll-response', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_WITH_DATE] },
        { isMj: false },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-poll-response')).toBeNull();
    });

    it('MJ, poll CLOSED avec chosenDate → bouton "Réinitialiser la date" visible (Story 8.8, AC4)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_WITH_DATE] },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Réinitialiser la date');
    });

    it('MJ, clic sur "Réinitialiser la date" (confirmé) → appelle resetSeanceDate et émet seanceLinked', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_WITH_DATE] },
        { isMj: true },
      );
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const updated = { ...SCENARIO, seances: [SEANCE_NO_POLL] };
      scenariosSvc.resetSeanceDate.mockResolvedValue(updated);
      const comp = fixture.componentInstance as any;
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      const btn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes('Réinitialiser la date')) as HTMLButtonElement;
      btn.click();
      await Promise.resolve();

      expect(scenariosSvc.resetSeanceDate).toHaveBeenCalledWith('seance1');
      expect(emitted).toEqual(updated);
    });

    it('MJ, clic sur "Réinitialiser la date" (refusé) → aucun appel à resetSeanceDate', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_WITH_DATE] },
        { isMj: true },
      );
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      const btn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes('Réinitialiser la date')) as HTMLButtonElement;
      btn.click();
      await Promise.resolve();

      expect(scenariosSvc.resetSeanceDate).not.toHaveBeenCalled();
    });

    it('poll CLOSED sans chosenDate → bouton "Réinitialiser la date" quand même visible (revue de code : sinon la séance reste bloquée)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_NO_DATE] },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Réinitialiser la date');
    });

    it("poll CLOSED sans chosenDate → message neutre plutôt qu'une date vide", async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_NO_DATE] },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Vote clôturé sans date retenue');
    });
  });

  describe('Inscription à capacité limitée (Story 8.3, révisé Story 8.8 : coexiste désormais avec le vote)', () => {
    const SEANCE_NO_CAPACITY: SeanceDto = { ...SEANCE_NO_POLL };
    const SEANCE_WITH_CAPACITY: SeanceDto = {
      ...SEANCE_NO_POLL,
      inscription: {
        min: 4,
        max: 6,
        inscrits: [{ userId: 'u2', pseudo: 'Bob' }],
        dateValidee: null,
      },
    };
    const SEANCE_AT_MAX: SeanceDto = {
      ...SEANCE_NO_POLL,
      inscription: {
        min: 4,
        max: 2,
        inscrits: [
          { userId: 'u2', pseudo: 'Bob' },
          { userId: 'u3', pseudo: 'Carl' },
        ],
        dateValidee: null,
      },
    };
    const SEANCE_INSCRIT = {
      ...SEANCE_NO_POLL,
      inscription: {
        min: 4,
        max: 6,
        inscrits: [{ userId: 'u1', pseudo: 'Alice' }],
        dateValidee: null,
      },
    };
    // Compat rétroactive : une date posée par l'ancienne validerDate() (Story 8.3/8.7, retirée en
    // 8.8), jamais issue d'un vote — le champ Seance.dateValidee brut reste lu en repli.
    const SEANCE_VALIDATED_LEGACY: SeanceDto = {
      ...SEANCE_NO_POLL,
      inscription: {
        min: 4,
        max: 6,
        inscrits: [{ userId: 'u2', pseudo: 'Bob' }],
        dateValidee: '2026-08-01T00:00:00.000Z',
      },
    };
    const SEANCE_WITH_CAPACITY_AND_OPEN_POLL: SeanceDto = {
      ...SEANCE_WITH_CAPACITY,
      poll: POLL,
    };
    const SEANCE_VALIDATED_VIA_POLL: SeanceDto = {
      ...SEANCE_WITH_CAPACITY,
      poll: {
        ...POLL,
        status: 'CLOSED',
        chosenDate: '2026-08-15T00:00:00.000Z',
        chosenSlot: 'AFTERNOON',
      },
    };
    const SEANCE_CLOSED_NO_DATE: SeanceDto = {
      ...SEANCE_WITH_CAPACITY,
      poll: { ...POLL, status: 'CLOSED' },
    };

    it('MJ, séance sans capacité définie → formulaire visible, aucun FillIndicator', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_CAPACITY] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.querySelector('.capacity-form')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeNull();
    });

    it('formulaire de capacité : bouton désactivé si un champ est vide ou si max < min, activé sinon', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_CAPACITY] },
        { isMj: true, isEpisodique: true },
      );
      const el = fixture.nativeElement as HTMLElement;
      const inputs = Array.from(el.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
      const [minInput, maxInput] = inputs;
      const submitBtn = Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Définir la capacité'),
      ) as HTMLButtonElement;

      // Champs vides par défaut → désactivé.
      expect(submitBtn.disabled).toBe(true);

      minInput.value = '4';
      minInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // min seul rempli, max toujours vide → toujours désactivé.
      expect(submitBtn.disabled).toBe(true);

      maxInput.value = '2';
      maxInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // max < min → toujours désactivé.
      expect(submitBtn.disabled).toBe(true);

      maxInput.value = '6';
      maxInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // min=4, max=6 → valide, activé.
      expect(submitBtn.disabled).toBe(false);
    });

    it('MJ, capacité définie, pas de vote en cours → FillIndicator + "Lancer le vote" + "Modifier la capacité" (Story 8.8, AC1/AC5)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('Lancer le vote');
      expect(fixture.nativeElement.textContent).toContain('Modifier la capacité');
    });

    it('MJ, clic sur "Lancer le vote" (épisodique) → navigue vers le calendrier avec seanceId (Story 8.8, AC1)', async () => {
      const { fixture, router } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] },
        { isMj: true, isEpisodique: true },
      );
      const btn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes('Lancer le vote')) as HTMLButtonElement;
      btn.click();

      expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'calendar'], {
        queryParams: { seanceId: 'seance1' },
      });
    });

    it('MJ, capacité définie + vote OPEN → FillIndicator + app-poll-status + "Clôturer le vote" (Story 8.8, AC2)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY_AND_OPEN_POLL] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-poll-status')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('Clôturer le vote');
    });

    it('MJ, capacité définie + vote clôturé avec chosenDate → "Date retenue", plus de FillIndicator/CTA (Story 8.8, AC2)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_VALIDATED_VIA_POLL] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
    });

    it('MJ, capacité définie + vote clôturé sans date retenue → bouton "Réinitialiser la date" quand même visible (revue de code)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_CLOSED_NO_DATE] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Vote clôturé sans date retenue');
      expect(fixture.nativeElement.textContent).toContain('Réinitialiser la date');
    });

    it('MJ, date validée (épisodique, via poll) → bouton "Réinitialiser la date" visible, appelle resetSeanceDate (Story 8.8, AC4)', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_VALIDATED_VIA_POLL] },
        { isMj: true, isEpisodique: true },
      );
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const updated = { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] };
      scenariosSvc.resetSeanceDate.mockResolvedValue(updated);
      const comp = fixture.componentInstance as any;
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      const btn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes('Réinitialiser la date')) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      btn.click();
      await Promise.resolve();

      expect(scenariosSvc.resetSeanceDate).toHaveBeenCalledWith('seance1');
      expect(emitted).toEqual(updated);
    });

    it('MJ, date validée (épisodique, héritage dateValidee sans poll) → bouton "Réinitialiser la date" visible (Story 8.8, AC4)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_VALIDATED_LEGACY] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Réinitialiser la date');
    });

    it('MJ, clic sur "Modifier la capacité" → réaffiche le formulaire pré-rempli (AC6)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] },
        { isMj: true, isEpisodique: true },
      );
      const btn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes('Modifier la capacité')) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();

      const inputs = Array.from(
        fixture.nativeElement.querySelectorAll('input[type="number"]'),
      ) as HTMLInputElement[];
      expect(inputs[0].value).toBe('4');
      expect(inputs[1].value).toBe('6');
    });

    it('MJ, mode édition capacité → bouton "Annuler" ferme le formulaire sans soumettre (revue de code)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] },
        { isMj: true, isEpisodique: true },
      );
      const editBtn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes('Modifier la capacité')) as HTMLButtonElement;
      editBtn.click();
      fixture.detectChanges();

      const cancelBtn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.trim() === 'Annuler') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();
      cancelBtn.click();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Modifier la capacité');
      expect(fixture.nativeElement.querySelectorAll('input[type="number"]').length).toBe(0);
    });

    it('MJ, date validée (héritage validerDate(), sans poll) → texte "Date retenue", plus de CTA ni FillIndicator', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_VALIDATED_LEGACY] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Modifier la capacité');
    });

    it('joueur, séance sans capacité définie → rien affiché', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_CAPACITY] },
        { isMj: false, isEpisodique: true },
      );
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeNull();
      expect(fixture.nativeElement.querySelector('.capacity-form')).toBeNull();
    });

    it('joueur non-inscrit → FillIndicator + bouton "S\'inscrire" actif', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] },
        { isMj: false, isEpisodique: true, currentUserId: 'u1' },
      );
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeTruthy();
      const btn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes("S'inscrire")) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(false);
    });

    it('joueur déjà inscrit → bouton "Se désinscrire" affiché à la place', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_INSCRIT] },
        { isMj: false, isEpisodique: true, currentUserId: 'u1' },
      );
      expect(fixture.nativeElement.textContent).toContain('Se désinscrire');
      expect(fixture.nativeElement.textContent).not.toContain("S'inscrire");
    });

    it('joueur non-inscrit, capacité au max → bouton "S\'inscrire" désactivé (AC4)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_AT_MAX] },
        { isMj: false, isEpisodique: true, currentUserId: 'u1' },
      );
      const btn: HTMLButtonElement = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent.includes("S'inscrire")) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('joueur, capacité définie + vote OPEN → FillIndicator/inscrire ET app-poll-response, tous deux visibles (Story 8.8, AC2)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY_AND_OPEN_POLL] },
        { isMj: false, isEpisodique: true, currentUserId: 'u1' },
      );
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-poll-response')).toBeTruthy();
    });

    it('joueur, date validée via poll.chosenDate → texte "Date retenue", plus de FillIndicator ni bouton', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_VALIDATED_VIA_POLL] },
        { isMj: false, isEpisodique: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeNull();
    });

    it('joueur, date validée (héritage validerDate(), sans poll) → texte "Date retenue", plus de FillIndicator ni bouton', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_VALIDATED_LEGACY] },
        { isMj: false, isEpisodique: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-fill-indicator')).toBeNull();
    });

    it('onSetCapacity appelle setSeanceCapacity et émet seanceLinked', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_CAPACITY] },
        { isMj: true, isEpisodique: true },
      );
      const comp = fixture.componentInstance as any;
      const updated = { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] };
      scenariosSvc.setSeanceCapacity.mockResolvedValue(updated);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onSetCapacity('seance1', 4, 6);

      expect(scenariosSvc.setSeanceCapacity).toHaveBeenCalledWith('seance1', 4, 6);
      expect(emitted).toEqual(updated);
    });

    it('onInscrire appelle inscrire et émet seanceLinked', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] },
        { isMj: false, isEpisodique: true },
      );
      const comp = fixture.componentInstance as any;
      const updated = { ...SCENARIO, seances: [SEANCE_INSCRIT] };
      scenariosSvc.inscrire.mockResolvedValue(updated);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onInscrire('seance1');

      expect(scenariosSvc.inscrire).toHaveBeenCalledWith('seance1');
      expect(emitted).toEqual(updated);
    });

    it('onDesinscrire appelle desinscrire et émet seanceLinked', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_INSCRIT] },
        { isMj: false, isEpisodique: true },
      );
      const comp = fixture.componentInstance as any;
      const updated = { ...SCENARIO, seances: [SEANCE_WITH_CAPACITY] };
      scenariosSvc.desinscrire.mockResolvedValue(updated);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onDesinscrire('seance1');

      expect(scenariosSvc.desinscrire).toHaveBeenCalledWith('seance1');
      expect(emitted).toEqual(updated);
    });
  });

  describe('Suppression d’une séance (Story 8.7, AC5)', () => {
    const SEANCE_2: SeanceDto = { ...SEANCE_NO_POLL, id: 'seance2' };

    it('MJ, première séance (i=0) → aucun bouton de suppression', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_2] },
        { isMj: true },
      );
      const rows = fixture.nativeElement.querySelectorAll('.seance-row');
      expect(
        Array.from(rows[0].querySelectorAll('button')).some((b: any) =>
          b.textContent.includes('Supprimer cette séance'),
        ),
      ).toBe(false);
    });

    it('MJ, séance non-première (i>0) → bouton de suppression visible', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_2] },
        { isMj: true },
      );
      const rows = fixture.nativeElement.querySelectorAll('.seance-row');
      expect(
        Array.from(rows[1].querySelectorAll('button')).some((b: any) =>
          b.textContent.includes('Supprimer cette séance'),
        ),
      ).toBe(true);
    });

    it('joueur (isMj=false) → jamais de bouton de suppression, quelle que soit la séance', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_2] },
        { isMj: false },
      );
      expect(fixture.nativeElement.textContent).not.toContain('Supprimer cette séance');
    });

    it('clic sur "Supprimer cette séance" (confirmé) → appelle deleteSeance et émet seanceLinked', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_2] },
        { isMj: true },
      );
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const updated = { ...SCENARIO, seances: [SEANCE_NO_POLL] };
      scenariosSvc.deleteSeance.mockResolvedValue(updated);
      const comp = fixture.componentInstance as any;
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onDeleteSeance(SEANCE_2);

      expect(scenariosSvc.deleteSeance).toHaveBeenCalledWith('seance2');
      expect(emitted).toEqual(updated);
    });

    it('confirmation refusée (window.confirm → false) → aucun appel à deleteSeance', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_2] },
        { isMj: true },
      );
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const comp = fixture.componentInstance as any;

      await comp.onDeleteSeance(SEANCE_2);

      expect(scenariosSvc.deleteSeance).not.toHaveBeenCalled();
    });

    it('séance sans date validée → confirmation générique (revue de code)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_2] },
        { isMj: true },
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const comp = fixture.componentInstance as any;

      await comp.onDeleteSeance(SEANCE_2);

      expect(confirmSpy).toHaveBeenCalledWith('Supprimer cette séance ? Cette action est définitive.');
    });

    it('séance épisodique avec date validée (inscription.dateValidee) → confirmation renforcée (revue de code)', async () => {
      const SEANCE_DATE_VALIDEE: SeanceDto = {
        ...SEANCE_2,
        inscription: {
          min: 2,
          max: 4,
          inscrits: [],
          dateValidee: '2026-08-15T00:00:00.000Z',
        },
      };
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_DATE_VALIDEE] },
        { isMj: true, isEpisodique: true },
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const comp = fixture.componentInstance as any;

      await comp.onDeleteSeance(SEANCE_DATE_VALIDEE);

      expect(confirmSpy).toHaveBeenCalledWith(
        'Cette séance a une date validée. La supprimer quand même ? Cette action est définitive.',
      );
    });

    it('séance linéaire avec vote clôturé et date choisie (poll.chosenDate) → confirmation renforcée (revue de code)', async () => {
      const SEANCE_POLL_CHOSEN: SeanceDto = {
        ...SEANCE_2,
        poll: {
          id: 'poll1',
          partieId: 'p1',
          status: 'CLOSED',
          scenarioRef: null,
          expiresAt: null,
          chosenDate: '2026-08-15T00:00:00.000Z',
          chosenSlot: 'AFTERNOON',
          options: [],
        },
      };
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL, SEANCE_POLL_CHOSEN] },
        { isMj: true },
      );
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const comp = fixture.componentInstance as any;

      await comp.onDeleteSeance(SEANCE_POLL_CHOSEN);

      expect(confirmSpy).toHaveBeenCalledWith(
        'Cette séance a une date validée. La supprimer quand même ? Cette action est définitive.',
      );
    });
  });

  describe('Compte-rendu de séance (Story 8.4, commun aux branches linéaire et épisodique)', () => {
    const SEANCE_WITH_COMPTE_RENDU: SeanceDto = {
      ...SEANCE_NO_POLL,
      compteRendu: 'Les PJ ont vaincu le dragon.',
    };
    const SEANCE_EMPTY_COMPTE_RENDU: SeanceDto = { ...SEANCE_NO_POLL, compteRendu: '' };
    const SEANCE_WHITESPACE_COMPTE_RENDU: SeanceDto = { ...SEANCE_NO_POLL, compteRendu: '   ' };

    it('MJ, branche linéaire → textarea + bouton toujours visibles, même sans compte-rendu (AC5)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL] },
        { isMj: true },
      );
      expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('Enregistrer le compte-rendu');
    });

    it('MJ, branche épisodique → textarea + bouton également visibles (AC1, indépendant du kind)', async () => {
      const seanceEpisodique: SeanceDto = {
        ...SEANCE_NO_POLL,
        inscription: { min: 4, max: 6, inscrits: [], dateValidee: null },
      };
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [seanceEpisodique] },
        { isMj: true, isEpisodique: true },
      );
      expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
    });

    it('MJ, séance avec compte-rendu existant → textarea pré-rempli', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_COMPTE_RENDU] },
        { isMj: true },
      );
      const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
      expect(textarea.value).toBe('Les PJ ont vaincu le dragon.');
    });

    it('joueur, compte-rendu présent → texte affiché, jamais de champ de saisie', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_COMPTE_RENDU] },
        { isMj: false },
      );
      expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Les PJ ont vaincu le dragon.');
    });

    it('joueur, compte-rendu null → état incitatif (AC4)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL] },
        { isMj: false },
      );
      expect(fixture.nativeElement.textContent).toContain(
        'Aucun compte-rendu pour cette séance pour le moment.',
      );
    });

    it('joueur, compte-rendu chaîne vide → état incitatif également (jamais un vide silencieux)', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_EMPTY_COMPTE_RENDU] },
        { isMj: false },
      );
      expect(fixture.nativeElement.textContent).toContain(
        'Aucun compte-rendu pour cette séance pour le moment.',
      );
    });

    it('joueur, compte-rendu composé uniquement d’espaces → état incitatif également', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WHITESPACE_COMPTE_RENDU] },
        { isMj: false },
      );
      expect(fixture.nativeElement.textContent).toContain(
        'Aucun compte-rendu pour cette séance pour le moment.',
      );
    });

    it('onSetCompteRendu appelle setCompteRendu et émet seanceLinked', async () => {
      const { fixture, scenariosSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_NO_POLL] },
        { isMj: true },
      );
      const comp = fixture.componentInstance as any;
      const updated = { ...SCENARIO, seances: [SEANCE_WITH_COMPTE_RENDU] };
      scenariosSvc.setCompteRendu.mockResolvedValue(updated);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onSetCompteRendu('seance1', 'Les PJ ont vaincu le dragon.');

      expect(scenariosSvc.setCompteRendu).toHaveBeenCalledWith(
        'seance1',
        'Les PJ ont vaincu le dragon.',
      );
      expect(emitted).toEqual(updated);
    });
  });
});
