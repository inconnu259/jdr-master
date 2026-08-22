import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CalendarAgendaView, type AgendaEntry } from './calendar-agenda-view';

async function createAgenda(entries: AgendaEntry[], loading = false) {
  await TestBed.configureTestingModule({ imports: [CalendarAgendaView] }).compileComponents();
  const fixture = TestBed.createComponent(CalendarAgendaView);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('loading', loading);
  fixture.detectChanges();
  return fixture;
}

const SEANCE: AgendaEntry = {
  key: 'seance-1',
  type: 'mes-seances',
  date: '2026-09-05',
  label: 'Chapitre 1',
};
const VOTE: AgendaEntry = {
  key: 'poll-1',
  type: 'votes-en-cours',
  date: '2026-09-02',
  label: 'Chapitre 2',
};

describe('CalendarAgendaView', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('état vide : message neutre quand aucune entrée (et pas en chargement)', async () => {
    const fixture = await createAgenda([]);
    expect(fixture.nativeElement.textContent).toContain(
      'Rien à afficher pour la période et les couches actives.',
    );
  });

  it('spinner affiché pendant le chargement, pas le message vide', async () => {
    const fixture = await createAgenda([], true);
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Rien à afficher');
  });

  it('trie les entrées chronologiquement (AC2)', async () => {
    const fixture = await createAgenda([SEANCE, VOTE]);
    const dates = Array.from(fixture.nativeElement.querySelectorAll('.agenda-entry__date')).map(
      (el: any) => el.textContent,
    );
    expect(dates).toEqual(['2026-09-02', '2026-09-05']);
  });

  it('chaque entrée porte un badge de type identifiable (AC2 : pas une liste indifférenciée)', async () => {
    const fixture = await createAgenda([SEANCE, VOTE]);
    const badges = Array.from(fixture.nativeElement.querySelectorAll('.agenda-entry__badge')).map(
      (el: any) => el.textContent,
    );
    expect(badges).toContain('Séance');
    expect(badges).toContain('Vote de date');
  });

  it('entrée sans date (inscriptions ouvertes) triée en tête, aucune date affichée', async () => {
    const openInscription: AgendaEntry = {
      key: 'i-1',
      type: 'inscriptions-ouvertes',
      date: '',
      label: 'Partie Y',
    };
    const fixture = await createAgenda([SEANCE, openInscription]);
    const entries = fixture.nativeElement.querySelectorAll('.agenda-entry');
    expect(entries[0].querySelector('.agenda-entry__label').textContent).toBe('Partie Y');
    expect(entries[0].querySelector('.agenda-entry__date')).toBeNull();
  });
});

// ─── Informations pratiques (Story 36.5) ─────────────────────────────────────

describe('CalendarAgendaView — informations pratiques', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC3 : les trois informations sont rendues, au niveau complet', async () => {
    const fixture = await createAgenda([
      {
        key: 'seance-s1',
        type: 'mes-seances',
        date: '2026-08-20',
        label: 'Le Convoi du Nord',
        seanceHeure: '20:30',
        seanceLieu: 'chez Marc',
        seanceNote: 'pensez aux dés',
      },
    ]);

    expect(fixture.nativeElement.querySelector('.agenda-entry__infos')?.textContent?.trim()).toBe(
      '20:30 · chez Marc · pensez aux dés',
    );
  });

  it('AC4 : sans informations, aucun nœud n’est rendu', async () => {
    const fixture = await createAgenda([
      {
        key: 'seance-s1',
        type: 'mes-seances',
        date: '2026-08-20',
        label: 'Le Convoi du Nord',
      },
    ]);

    expect(fixture.nativeElement.querySelector('.agenda-entry__infos')).toBeNull();
  });

  it('`detail` n’est jamais écrasé par les informations pratiques', async () => {
    const fixture = await createAgenda([
      {
        key: 'seance-s1',
        type: 'mes-seances',
        date: '2026-08-20',
        label: 'Le Convoi du Nord',
        detail: 'EVENING',
        seanceLieu: 'chez Marc',
      },
    ]);

    expect(fixture.nativeElement.querySelector('.agenda-entry__detail')?.textContent?.trim()).toBe(
      'EVENING',
    );
    expect(fixture.nativeElement.querySelector('.agenda-entry__infos')?.textContent?.trim()).toBe(
      'chez Marc',
    );
  });
});

describe('CalendarAgendaView — piste de participation (Story 36.6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const VOTED: AgendaEntry = {
    ...VOTE,
    key: 'poll-1-o1',
    vote: {
      partieId: 'partie-1',
      pollId: 'poll-1',
      optionId: 'o1',
      yes: 2,
      maybe: 1,
      no: 0,
      total: 4,
      myAnswer: 'YES',
    },
  };

  it('AC1 — une entrée de vote porte sa piste', async () => {
    const fixture = await createAgenda([VOTED]);
    expect(fixture.nativeElement.querySelector('app-poll-track')).toBeTruthy();
  });

  it('AC4 — l’Agenda a la place : le compteur « 3 / 4 » y figure', async () => {
    const fixture = await createAgenda([VOTED]);
    expect(fixture.nativeElement.querySelector('.cnt')?.textContent?.trim()).toBe('3 / 4');
  });

  it('AC5 — ma réponse y est écrite en toutes lettres', async () => {
    const fixture = await createAgenda([VOTED]);
    expect(fixture.nativeElement.textContent).toContain('tu as dit oui');
  });

  it('une entrée de vote sans participation ne rend aucune piste', async () => {
    const fixture = await createAgenda([VOTE]);
    expect(fixture.nativeElement.querySelector('app-poll-track')).toBeNull();
  });

  it('une séance ne porte jamais de piste', async () => {
    const fixture = await createAgenda([SEANCE]);
    expect(fixture.nativeElement.querySelector('app-poll-track')).toBeNull();
  });
});

describe('CalendarAgendaView — activer une option de vote (Story 36.7, AC7)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const VOTED: AgendaEntry = {
    ...VOTE,
    key: 'poll-1-o1',
    vote: {
      partieId: 'partie-1',
      pollId: 'poll-1',
      optionId: 'o1',
      yes: 2,
      maybe: 1,
      no: 0,
      total: 4,
      myAnswer: null,
    },
  };

  it('une ligne de vote est activable, et le signale avec son ancre', async () => {
    const fixture = await createAgenda([VOTED]);
    const emitted: any[] = [];
    fixture.componentInstance.voteOptionActivated.subscribe((e: any) => emitted.push(e));

    const btn = fixture.nativeElement.querySelector('button.agenda-entry__vote-action');
    expect(btn).toBeTruthy();
    btn.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].vote.optionId).toBe('o1');
    expect(emitted[0].anchor).toBe(btn);
  });

  it('une entrée sans participation servie n’est pas activable', async () => {
    const fixture = await createAgenda([{ ...VOTED, vote: undefined }]);
    expect(fixture.nativeElement.querySelector('button.agenda-entry__vote-action')).toBeNull();
  });

  it('une entrée qui n’est pas un vote n’est jamais activable', async () => {
    const fixture = await createAgenda([{ ...VOTE, type: 'mes-seances', vote: undefined }]);
    expect(fixture.nativeElement.querySelector('button.agenda-entry__vote-action')).toBeNull();
  });
});
