import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { RailTarget } from '../day-detail.utils';
import type { VoteOptionActivatedEvent } from '../poll-track.utils';
import { CalendarAgendaView, type AgendaEntry } from './calendar-agenda-view';

/** Toutes les dates des fixtures sont relatives à ce jour, injecté — aucun `new Date()` réel
 *  n'entre dans ces tests (piège n°14 de la story). */
const TODAY = '2026-08-22';

async function createAgenda(entries: AgendaEntry[], loading = false, todayKey = TODAY) {
  await TestBed.configureTestingModule({ imports: [CalendarAgendaView] }).compileComponents();
  const fixture = TestBed.createComponent(CalendarAgendaView);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('loading', loading);
  fixture.componentRef.setInput('todayKey', todayKey);
  fixture.detectChanges();
  return fixture;
}

function sectionTitles(fixture: { nativeElement: HTMLElement }): string[] {
  return [...fixture.nativeElement.querySelectorAll('.agenda-section__title')].map((n) =>
    (n.textContent ?? '').trim(),
  );
}

function entryTitles(fixture: { nativeElement: HTMLElement }): string[] {
  return [...fixture.nativeElement.querySelectorAll('.agenda-entry__title')].map((n) =>
    (n.textContent ?? '').trim(),
  );
}

function badges(fixture: { nativeElement: HTMLElement }): string[] {
  return [...fixture.nativeElement.querySelectorAll('.agenda-badge')].map((n) =>
    (n.textContent ?? '').trim(),
  );
}

const SEANCE: AgendaEntry = {
  key: 'seance-1',
  type: 'mes-seances',
  date: '2026-09-05',
  label: 'Le Convoi du Nord',
  slot: 'EVENING',
  partieId: 'p1',
  scenarioId: 's1',
  seanceId: 'se1',
  compteRenduManquant: false,
};

const VOTE: AgendaEntry = {
  key: 'poll-1',
  type: 'votes-en-cours',
  date: '2026-08-28',
  label: 'Les Cendres d’Ashal',
  slot: 'EVENING',
  detail: 'Soir',
  vote: {
    partieId: 'p1',
    pollId: 'poll1',
    optionId: 'o1',
    yes: 2,
    maybe: 0,
    no: 0,
    total: 4,
    myAnswer: null,
  },
};

const INSCRIPTION: AgendaEntry = {
  key: 'inscription-1',
  type: 'inscriptions-ouvertes',
  date: '',
  label: 'La Halte du Griffon',
  detail: '3/5 inscrits',
  jeSuisInscrit: false,
};

const PASSEE: AgendaEntry = {
  ...SEANCE,
  key: 'seance-old',
  date: '2026-08-01',
  compteRenduManquant: true,
};

describe('CalendarAgendaView — les trois sections (AC1, AC10)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC1 : trois sections, dans l’ordre contractuel', async () => {
    const fixture = await createAgenda([SEANCE, VOTE, INSCRIPTION, PASSEE]);
    expect(sectionTitles(fixture)).toEqual([
      'Ce qui t’attend',
      'Ce qui est annoncé',
      'Ce qui est révolu',
    ]);
  });

  it('AC1 : 🚨 AUCUN jour ne figure en en-tête — les en-têtes sont les trois titres, rien d’autre', async () => {
    const fixture = await createAgenda([SEANCE, VOTE, INSCRIPTION, PASSEE]);
    const headings = [...fixture.nativeElement.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((n) =>
      (n.textContent ?? '').trim(),
    );
    expect(headings).toHaveLength(3);
    for (const h of headings) {
      expect(h).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(h).not.toMatch(/septembre|août|samedi|vendredi/i);
    }
  });

  it('AC10 : une section sans entrée n’est pas rendue du tout', async () => {
    const fixture = await createAgenda([VOTE]);
    expect(sectionTitles(fixture)).toEqual(['Ce qui t’attend']);
    expect(fixture.nativeElement.querySelectorAll('.agenda-section')).toHaveLength(1);
  });

  it('AC10 : rien à afficher → un message unique, aucune section', async () => {
    const fixture = await createAgenda([]);
    expect(fixture.nativeElement.querySelector('.agenda-view__empty').textContent).toContain(
      'Rien ne t’attend',
    );
    expect(fixture.nativeElement.querySelectorAll('.agenda-section')).toHaveLength(0);
  });

  it('AC10 : pendant le chargement, le spinner et JAMAIS le message de vide', async () => {
    const fixture = await createAgenda([], true);
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.agenda-view__empty')).toBeNull();
  });

  it('encadré n°4 : les trois couches de disponibilité ne produisent aucune ligne', async () => {
    const fixture = await createAgenda([
      { key: 'd1', type: 'mes-disponibilites', date: TODAY, label: 'Ponctuel' },
      { key: 'd2', type: 'mes-indisponibilites', date: TODAY, label: 'Récurrent' },
      { key: 'g1', type: 'disponibilite-groupe', date: TODAY, label: 'Soir — 2/4 disponibles' },
    ]);
    expect(fixture.nativeElement.querySelectorAll('.agenda-entry')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.agenda-view__empty')).toBeTruthy();
  });

  it('🚨 une séance passée sans `compteRenduManquant` (calendrier personnel) reste hors agenda', async () => {
    const personnelle: AgendaEntry = { ...SEANCE, key: 'p', date: '2026-08-01' };
    delete personnelle.compteRenduManquant;
    const fixture = await createAgenda([personnelle]);
    expect(fixture.nativeElement.querySelectorAll('.agenda-entry')).toHaveLength(0);
  });
});

describe('CalendarAgendaView — la date est une propriété de la ligne (AC2, AC3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC2 : la date et le créneau sont rendus SUR la ligne, en clair', async () => {
    const fixture = await createAgenda([SEANCE]);
    const meta = fixture.nativeElement.querySelector('.agenda-entry__meta').textContent;
    expect(meta).toContain('samedi 5 septembre');
    expect(meta).toContain('soir');
  });

  it('AC2 : le code brut du créneau ne fuit jamais à l’écran', async () => {
    const fixture = await createAgenda([SEANCE, VOTE]);
    expect(fixture.nativeElement.textContent).not.toContain('EVENING');
  });

  it('AC2 : les informations pratiques suivent la date, sans écraser le reste', async () => {
    const fixture = await createAgenda([
      { ...SEANCE, seanceHeure: '20:30', seanceLieu: 'chez Marc', seanceNote: 'pensez aux dés' },
    ]);
    const meta = fixture.nativeElement.querySelector('.agenda-entry__meta').textContent;
    expect(meta).toContain('20:30 · chez Marc · pensez aux dés');
    expect(meta).toContain('samedi 5 septembre');
  });

  it('AC3 : une inscription sans date figure dans « Ça t’attend » et le dit', async () => {
    const fixture = await createAgenda([INSCRIPTION]);
    expect(sectionTitles(fixture)).toEqual(['Ce qui t’attend']);
    const meta = fixture.nativeElement.querySelector('.agenda-entry__meta').textContent;
    expect(meta).toContain('3/5 inscrits');
    expect(meta).toContain('sans date');
  });

  it('AC3 : une entrée sans date ne rend aucun séparateur orphelin', async () => {
    const fixture = await createAgenda([INSCRIPTION]);
    const meta = fixture.nativeElement.querySelector('.agenda-entry__meta').textContent.trim();
    expect(meta.startsWith('·')).toBe(false);
    expect(meta.endsWith('·')).toBe(false);
  });
});

describe('CalendarAgendaView — badges dépendants du lecteur (AC4, AC8, AC11)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC4 : sans ma réponse le vote appelle une action…', async () => {
    const fixture = await createAgenda([VOTE]);
    expect(badges(fixture)).toEqual(['Réponds au vote']);
  });

  it('AC4 : …et le MÊME vote change de libellé une fois répondu, sans disparaître', async () => {
    const fixture = await createAgenda([{ ...VOTE, vote: { ...VOTE.vote!, myAnswer: 'YES' } }]);
    expect(entryTitles(fixture)).toEqual(['Les Cendres d’Ashal']);
    expect(badges(fixture)).toEqual(['Vote en cours']);
  });

  it('AC8 : une inscription dit s’il reste quelque chose à faire', async () => {
    const libre = await createAgenda([INSCRIPTION]);
    expect(badges(libre)).toEqual(['S’inscrire']);
    TestBed.resetTestingModule();
    const prise = await createAgenda([{ ...INSCRIPTION, jeSuisInscrit: true }]);
    expect(badges(prise)).toEqual(['Inscrit']);
  });

  it('AC8 : une séance passée sans compte-rendu appelle le débrief', async () => {
    const fixture = await createAgenda([PASSEE]);
    expect(badges(fixture)).toEqual(['Débriefer']);
  });

  it('AC11 : trois intensités, une seule teinte — jamais une cinquième couleur', async () => {
    const fixture = await createAgenda([
      { ...SEANCE, key: 'loin', date: '2026-09-12' },
      { ...SEANCE, key: 'proche', date: '2026-08-26' },
      { ...SEANCE, key: 'imminent', date: '2026-08-23' },
    ]);
    const classes = [...fixture.nativeElement.querySelectorAll('.agenda-badge')].map(
      (n: Element) => n.className,
    );
    // Ordre du DOM = ordre de la section, donc par date croissante : imminent, proche, lointain.
    expect(classes.every((c) => c.includes('agenda-badge--soon'))).toBe(true);
    expect(classes[0]).toContain('agenda-badge--imminent');
    expect(classes[1]).toContain('agenda-badge--near');
    expect(classes[2]).toContain('agenda-badge--far');
  });

  it('AC11 : le dernier palier parle humain — « demain soir », jamais « J-1 »', async () => {
    const fixture = await createAgenda([{ ...SEANCE, date: '2026-08-23' }]);
    expect(badges(fixture)).toEqual(['demain soir']);
  });

  it('AC8 : aucune ligne ne porte la couleur seule — chaque badge a un libellé non vide', async () => {
    const fixture = await createAgenda([SEANCE, VOTE, INSCRIPTION, PASSEE]);
    const labels = badges(fixture);
    expect(labels).toHaveLength(4);
    expect(labels.every((l) => l.length > 0)).toBe(true);
  });
});

describe('CalendarAgendaView — ordre à l’intérieur des sections', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('« Ça t’attend » : ce qui réclame une action d’abord, puis par date, sans date en dernier', async () => {
    const fixture = await createAgenda([
      { ...VOTE, key: 'repondu', label: 'B répondu', vote: { ...VOTE.vote!, myAnswer: 'YES' } },
      INSCRIPTION,
      { ...VOTE, key: 'attente', label: 'A en attente', date: '2026-08-30' },
    ]);
    expect(entryTitles(fixture)).toEqual(['A en attente', 'La Halte du Griffon', 'B répondu']);
  });

  it('« Ce qui est annoncé » : par date croissante', async () => {
    const fixture = await createAgenda([
      { ...SEANCE, key: 'tard', label: 'Tard', date: '2026-10-01' },
      { ...SEANCE, key: 'tot', label: 'Tôt', date: '2026-09-01' },
    ]);
    expect(entryTitles(fixture)).toEqual(['Tôt', 'Tard']);
  });

  it('« Ce qui est révolu » : du plus récent au plus ancien', async () => {
    const fixture = await createAgenda([
      { ...PASSEE, key: 'vieux', label: 'Vieux', date: '2026-06-01' },
      { ...PASSEE, key: 'hier', label: 'Hier', date: '2026-08-21' },
    ]);
    expect(entryTitles(fixture)).toEqual(['Hier', 'Vieux']);
  });
});

describe('CalendarAgendaView — activer une ligne (AC5, AC12)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC5 : une ligne portant une séance est un bouton qui ouvre LE SCÉNARIO', async () => {
    const fixture = await createAgenda([SEANCE]);
    const emitted: RailTarget[] = [];
    fixture.componentInstance.scenarioActivated.subscribe((t: RailTarget) => emitted.push(t));

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.agenda-entry__open');
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toContain('Ouvrir le scénario Le Convoi du Nord');
    expect(button.getAttribute('aria-label')).not.toContain('séance');

    button.click();
    expect(emitted).toEqual([{ partieId: 'p1', scenarioId: 's1' }]);
  });

  it('AC12 : sans scénario identifiable, la ligne n’est PAS un bouton (pas de bouton désactivé)', async () => {
    const fixture = await createAgenda([INSCRIPTION]);
    expect(fixture.nativeElement.querySelector('.agenda-entry__open')).toBeNull();
    expect(fixture.nativeElement.querySelector('.agenda-entry__static')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('button[disabled]')).toBeNull();
  });

  it('AC12 : 🚨 une ligne de vote n’est jamais ouvrable — pas de bouton dans un bouton', async () => {
    const fixture = await createAgenda([{ ...VOTE, partieId: 'p1', scenarioId: 's1' }]);
    expect(fixture.nativeElement.querySelector('.agenda-entry__open')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.agenda-entry button')).toHaveLength(1);
  });
});

describe('CalendarAgendaView — le sélecteur de réponse survit à la refonte (AC13)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('une ligne de vote porte sa piste et reste activable, avec son ancre', async () => {
    const fixture = await createAgenda([VOTE]);
    const emitted: VoteOptionActivatedEvent[] = [];
    fixture.componentInstance.voteOptionActivated.subscribe((e: VoteOptionActivatedEvent) =>
      emitted.push(e),
    );

    expect(fixture.nativeElement.querySelector('app-poll-track')).toBeTruthy();
    const action: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.agenda-entry__vote-action',
    );
    expect(action.getAttribute('aria-label')).toContain('Répondre au vote');
    expect(action.getAttribute('aria-haspopup')).toBe('menu');

    action.click();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].vote.optionId).toBe('o1');
    expect(emitted[0].slot).toBe('EVENING');
    expect(emitted[0].anchor).toBe(action);
  });

  it('une séance ne porte jamais de piste de participation', async () => {
    const fixture = await createAgenda([SEANCE]);
    expect(fixture.nativeElement.querySelector('app-poll-track')).toBeNull();
  });
});
