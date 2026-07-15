import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import type { AnnouncementDto, CharacterDto, PartieKind, ScenarioDto } from '@master-jdr/shared';
import { ScenarioReadDialog, type ScenarioReadDialogData } from './scenario-read-dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { PollService } from '../../../core/poll/poll.service';
import { CharacterService } from '../../../core/characters/character.service';
import { AnnouncementsService } from '../../../core/announcements/announcements.service';
import { makeAnnouncementDto } from '../../../core/announcements/announcement-dto.fixture';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';

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
  seances: [],
};

async function createComponent(
  scenario: ScenarioDto,
  {
    partieKind = 'ONE_SHOT' as PartieKind,
    characters = [] as CharacterDto[],
    currentUserId = 'viewer1',
    isMj = false,
    ownNotes = [] as unknown[],
    announcements = [] as AnnouncementDto[],
  }: {
    partieKind?: PartieKind;
    characters?: CharacterDto[];
    currentUserId?: string;
    isMj?: boolean;
    ownNotes?: unknown[];
    announcements?: AnnouncementDto[];
  } = {},
) {
  const dialogRef = { close: vi.fn() };
  const data: ScenarioReadDialogData = { scenario, partieKind, characters, isMj };
  const scenariosSvc = {
    participate: vi.fn(),
    linkSeancePoll: vi.fn(),
    listAll: vi.fn().mockResolvedValue([scenario]),
  };
  const authSvc = { currentUser: () => ({ id: currentUserId }) };
  const pollSvc = { chooseDate: vi.fn(), closePoll: vi.fn() };
  const router = { navigate: vi.fn() };
  const characterSvc = {
    getNotes: vi.fn().mockResolvedValue(ownNotes),
    setJournalAutoAssociate: vi.fn(),
    setNoteScenario: vi.fn(),
    toggleNoteShare: vi.fn(),
  };
  const announcementsSvc = { listAll: vi.fn().mockResolvedValue(announcements) };

  await TestBed.configureTestingModule({
    imports: [ScenarioReadDialog],
    providers: [
      provideAnimationsAsync(),
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: AuthService, useValue: authSvc },
      { provide: PollService, useValue: pollSvc },
      { provide: Router, useValue: router },
      { provide: CharacterService, useValue: characterSvc },
      { provide: AnnouncementsService, useValue: announcementsSvc },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ScenarioReadDialog);
  fixture.detectChanges();
  // ngOnInit recharge le scénario de façon async (mock résolu) — zoneless, on vide la file de
  // microtasks avant de faire des assertions sur le rendu qui en dépend.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  return { fixture, dialogRef, scenariosSvc, router, characterSvc, announcementsSvc };
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

  describe('CTA « Rédiger/Modifier le résumé de fin » (AC4, Story 8.5 — fix accessibilité de navigation)', () => {
    it('MJ + PASSE sans résumé → bouton « Rédiger le résumé de fin » visible', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE', resumeFin: null },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Rédiger le résumé de fin');
    });

    it('MJ + PASSE avec résumé déjà rédigé → bouton « Modifier le résumé de fin » visible', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE', resumeFin: 'Les PJ ont vaincu le dragon.' },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Modifier le résumé de fin');
    });

    it('joueur (isMj=false) + PASSE → aucun CTA de rédaction', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE', resumeFin: null },
        { isMj: false },
      );
      expect(fixture.nativeElement.textContent).not.toContain('résumé de fin');
    });

    it('MJ + statut non-PASSE → aucun CTA (section résumé absente)', async () => {
      const { fixture } = await createComponent({ ...BASE, status: 'COURANT' }, { isMj: true });
      expect(fixture.nativeElement.textContent).not.toContain('résumé de fin');
    });

    it('clic → ferme le dialogue et navigue vers la fiche d’édition (ScenarioEditor)', async () => {
      const { fixture, dialogRef, router } = await createComponent(
        { ...BASE, status: 'PASSE', resumeFin: null },
        { isMj: true },
      );
      const comp = fixture.componentInstance as any;

      comp.editResume();

      expect(dialogRef.close).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/parties', 'p1', 'scenarios', 's1'], {
        state: { scenario: expect.objectContaining({ id: 's1' }) },
      });
    });
  });

  describe('Journal associé (Story 8.6)', () => {
    it('propriétaire d’un personnage participant + PASSE → switch et journal visibles', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1' },
      );
      expect(fixture.nativeElement.textContent).toContain('Association automatique');
    });

    it('non-participant (aucun personnage sur cette Partie) → section absente', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [], currentUserId: 'viewer1' },
      );
      expect(fixture.nativeElement.textContent).not.toContain('Association automatique');
    });

    it('scénario non-PASSE → section absente même avec un personnage participant', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const { fixture } = await createComponent(
        { ...BASE, status: 'COURANT' },
        { characters: [owner], currentUserId: 'viewer1' },
      );
      expect(fixture.nativeElement.textContent).not.toContain('Association automatique');
    });

    it('switch reflète journalAutoAssociate du personnage', async () => {
      const owner = makeCharacterDto({
        id: 'char1',
        userId: 'viewer1',
        journalAutoAssociate: true,
      });
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1' },
      );
      const checkbox = fixture.nativeElement.querySelector(
        'input.journal-auto-associate-toggle',
      ) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it('changer le switch → appelle setJournalAutoAssociate', async () => {
      const owner = makeCharacterDto({
        id: 'char1',
        userId: 'viewer1',
        journalAutoAssociate: false,
      });
      const { fixture, characterSvc } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1' },
      );
      characterSvc.setJournalAutoAssociate.mockResolvedValue({
        ...owner,
        journalAutoAssociate: true,
      });
      const comp = fixture.componentInstance as any;

      await comp.toggleAutoAssociate(true);

      expect(characterSvc.setJournalAutoAssociate).toHaveBeenCalledWith('char1', true);
    });

    it('case à cocher d’une note reflète note.scenarioId === scenario.id', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const notes = [
        {
          id: 'n1',
          characterId: 'char1',
          text: 'Associée',
          shared: false,
          scenarioId: 's1',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'n2',
          characterId: 'char1',
          text: 'Non associée',
          shared: false,
          scenarioId: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ];
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1', ownNotes: notes },
      );
      const checkboxes = fixture.nativeElement.querySelectorAll(
        'input.note-scenario-toggle',
      ) as NodeListOf<HTMLInputElement>;
      expect(checkboxes[0].checked).toBe(true);
      expect(checkboxes[1].checked).toBe(false);
    });

    it('cocher une note → appelle setNoteScenario avec l’id du scénario courant', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const notes = [
        {
          id: 'n1',
          characterId: 'char1',
          text: 'Non associée',
          shared: false,
          scenarioId: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ];
      const { fixture, characterSvc } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1', ownNotes: notes },
      );
      characterSvc.setNoteScenario.mockResolvedValue({ ...notes[0], scenarioId: 's1' });
      const comp = fixture.componentInstance as any;

      await comp.toggleNoteAssociation(notes[0], true);

      expect(characterSvc.setNoteScenario).toHaveBeenCalledWith('char1', 'n1', 's1');
    });

    it('décocher une note → appelle setNoteScenario avec null', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const notes = [
        {
          id: 'n1',
          characterId: 'char1',
          text: 'Associée',
          shared: false,
          scenarioId: 's1',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ];
      const { fixture, characterSvc } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1', ownNotes: notes },
      );
      characterSvc.setNoteScenario.mockResolvedValue({ ...notes[0], scenarioId: null });
      const comp = fixture.componentInstance as any;

      await comp.toggleNoteAssociation(notes[0], false);

      expect(characterSvc.setNoteScenario).toHaveBeenCalledWith('char1', 'n1', null);
    });

    it('retrospectiveNotes affichées pour tout membre, y compris non-propriétaire', async () => {
      const { fixture } = await createComponent(
        {
          ...BASE,
          status: 'PASSE',
          retrospectiveNotes: [
            {
              id: 'n1',
              characterId: 'char-other',
              text: 'Un souvenir marquant',
              shared: true,
              scenarioId: null,
              createdAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        },
        { characters: [], currentUserId: 'viewer1' },
      );
      expect(fixture.nativeElement.textContent).toContain('Un souvenir marquant');
    });

    it('note privée cochée → indice affiché invitant à déverrouiller (revue de code, fuite de confidentialité)', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const notes = [
        {
          id: 'n1',
          characterId: 'char1',
          text: 'Note privée associée',
          shared: false,
          scenarioId: 's1',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ];
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1', ownNotes: notes },
      );
      expect(fixture.nativeElement.textContent).toContain('déverrouillez-la');
    });

    it('note partagée cochée → aucun indice de déverrouillage', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const notes = [
        {
          id: 'n1',
          characterId: 'char1',
          text: 'Note partagée associée',
          shared: true,
          scenarioId: 's1',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ];
      const { fixture } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1', ownNotes: notes },
      );
      expect(fixture.nativeElement.textContent).not.toContain('déverrouillez-la');
    });

    it('clic sur le cadenas → appelle toggleNoteShare et bascule shared', async () => {
      const owner = makeCharacterDto({ id: 'char1', userId: 'viewer1' });
      const notes = [
        {
          id: 'n1',
          characterId: 'char1',
          text: 'Note privée',
          shared: false,
          scenarioId: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ];
      const { fixture, characterSvc } = await createComponent(
        { ...BASE, status: 'PASSE' },
        { characters: [owner], currentUserId: 'viewer1', ownNotes: notes },
      );
      characterSvc.toggleNoteShare.mockResolvedValue({ ...notes[0], shared: true });
      const comp = fixture.componentInstance as any;

      await comp.toggleShare(notes[0]);

      expect(characterSvc.toggleNoteShare).toHaveBeenCalledWith('char1', 'n1', true);
    });
  });

  describe('Participation (AC8, Story 8.1)', () => {
    it.each(['ONE_SHOT', 'CAMPAGNE_LINEAIRE'] as const)(
      '%s → section participants/bouton absents',
      async (partieKind) => {
        const { fixture } = await createComponent({ ...BASE, status: 'COURANT' }, { partieKind });
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

  describe('Séances / vote de date (AC5, Story 8.2)', () => {
    it('A_VENIR (isRestricted true) avec une séance liée à un poll OPEN → le vote reste accessible malgré le masquage anti-spoil', async () => {
      const { fixture } = await createComponent(
        {
          ...BASE,
          status: 'A_VENIR',
          seances: [
            {
              id: 'seance1',
              scenarioId: 's1',
              compteRendu: null,
              createdAt: '2026-07-12T00:00:00.000Z',
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
        },
        { partieKind: 'CAMPAGNE_LINEAIRE' },
      );

      // Description/durées masquées (anti-spoil), mais le vote reste dans le DOM.
      expect(fixture.nativeElement.textContent).not.toContain('Une enquête discrète.');
      expect(fixture.nativeElement.querySelector('app-poll-response')).toBeTruthy();
    });
  });

  describe('Rafraîchissement à l’ouverture (bug-fix post-8.2 : vote décidé ailleurs affiché comme obsolète)', () => {
    it('ngOnInit recharge le scénario via listAll et remplace l’instantané reçu en donnée de dialogue', async () => {
      const stale = { ...BASE, status: 'COURANT' as const };
      const dialogRef = { close: vi.fn() };
      const data: ScenarioReadDialogData = {
        scenario: stale,
        partieKind: 'ONE_SHOT',
        characters: [],
      };
      const fresh = { ...stale, resumeFin: 'mis à jour côté serveur' };
      const scenariosSvc = {
        participate: vi.fn(),
        linkSeancePoll: vi.fn(),
        listAll: vi.fn().mockResolvedValue([fresh]),
      };
      await TestBed.configureTestingModule({
        imports: [ScenarioReadDialog],
        providers: [
          provideAnimationsAsync(),
          { provide: MatDialogRef, useValue: dialogRef },
          { provide: MAT_DIALOG_DATA, useValue: data },
          { provide: ScenariosService, useValue: scenariosSvc },
          { provide: AuthService, useValue: { currentUser: () => ({ id: 'viewer1' }) } },
          { provide: PollService, useValue: { chooseDate: vi.fn(), closePoll: vi.fn() } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(ScenarioReadDialog);
      fixture.detectChanges();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      const comp = fixture.componentInstance as any;
      expect(comp.scenario().resumeFin).toBe('mis à jour côté serveur');
    });

    it('échec du rechargement → le scénario reçu en donnée de dialogue reste affiché tel quel', async () => {
      const dialogRef = { close: vi.fn() };
      const data: ScenarioReadDialogData = {
        scenario: BASE,
        partieKind: 'ONE_SHOT',
        characters: [],
      };
      const scenariosSvc = {
        participate: vi.fn(),
        linkSeancePoll: vi.fn(),
        listAll: vi.fn().mockRejectedValue(new Error('network')),
      };
      await TestBed.configureTestingModule({
        imports: [ScenarioReadDialog],
        providers: [
          provideAnimationsAsync(),
          { provide: MatDialogRef, useValue: dialogRef },
          { provide: MAT_DIALOG_DATA, useValue: data },
          { provide: ScenariosService, useValue: scenariosSvc },
          { provide: AuthService, useValue: { currentUser: () => ({ id: 'viewer1' }) } },
          { provide: PollService, useValue: { chooseDate: vi.fn(), closePoll: vi.fn() } },
          { provide: AnnouncementsService, useValue: { listAll: vi.fn().mockResolvedValue([]) } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(ScenarioReadDialog);
      fixture.detectChanges();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      const comp = fixture.componentInstance as any;
      expect(comp.scenario()).toEqual(BASE);
    });
  });

  describe('annonces scopées au scénario (Story 9.2)', () => {
    it('AC2 : annonce scopée affichée pour un membre quand le statut est COURANT/PASSE', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'COURANT' },
        { announcements: [makeAnnouncementDto({ scenarioId: 's1', text: 'Annonce visible' })] },
      );

      expect(fixture.nativeElement.textContent).toContain('Annonce visible');
    });

    it("AC6 : jamais affichée quand le statut est A_VENIR/BROUILLON, même si la donnée est présente", async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'A_VENIR' },
        {
          announcements: [
            makeAnnouncementDto({ scenarioId: 's1', text: 'Ne doit jamais apparaître' }),
          ],
        },
      );

      expect(fixture.nativeElement.textContent).not.toContain('Ne doit jamais apparaître');
    });

    it('AC3 : joueur non participant à un scénario CAMPAGNE_EPISODIQUE → aucune annonce visible', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'COURANT', participants: [] },
        {
          partieKind: 'CAMPAGNE_EPISODIQUE',
          currentUserId: 'viewer1',
          announcements: [
            makeAnnouncementDto({ scenarioId: 's1', text: 'Réservé aux participants' }),
          ],
        },
      );

      expect(fixture.nativeElement.textContent).not.toContain('Réservé aux participants');
    });

    it('AC3 : joueur participant à un scénario CAMPAGNE_EPISODIQUE → annonce visible', async () => {
      const { fixture } = await createComponent(
        {
          ...BASE,
          status: 'COURANT',
          participants: [{ userId: 'viewer1', pseudo: 'Viewer' }],
        },
        {
          partieKind: 'CAMPAGNE_EPISODIQUE',
          currentUserId: 'viewer1',
          announcements: [
            makeAnnouncementDto({ scenarioId: 's1', text: 'Visible du participant' }),
          ],
        },
      );

      expect(fixture.nativeElement.textContent).toContain('Visible du participant');
    });

    it('MJ → annonce toujours visible sur un scénario épisodique, même sans être participant', async () => {
      const { fixture } = await createComponent(
        { ...BASE, status: 'COURANT', participants: [] },
        {
          partieKind: 'CAMPAGNE_EPISODIQUE',
          currentUserId: 'mj1',
          isMj: true,
          announcements: [makeAnnouncementDto({ scenarioId: 's1', text: 'Visible du MJ' })],
        },
      );

      expect(fixture.nativeElement.textContent).toContain('Visible du MJ');
    });
  });
});
