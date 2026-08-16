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
