import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { afterEach, describe, expect, it } from 'vitest';
import type { CalendarLayerKey } from '@master-jdr/shared';
import { CalendarDetailRail } from './calendar-detail-rail';
import type { AgendaEntry } from '../calendar-agenda-view/calendar-agenda-view';
import { type DayDetail, buildDayDetail } from '../day-detail.utils';

const ALL_LAYERS: CalendarLayerKey[] = [
  'mes-indisponibilites',
  'mes-disponibilites',
  'mes-seances',
  'votes-en-cours',
  'inscriptions-ouvertes',
  'disponibilite-groupe',
];

const NOW = new Date('2026-08-17T00:00:00Z');

const SEANCE: AgendaEntry = {
  key: 'seance-s1',
  type: 'mes-seances',
  date: '2026-08-20',
  label: 'Le Convoi du Nord',
  slot: 'EVENING',
  partieId: 'p1',
  scenarioId: 'sc1',
  seanceId: 's1',
};

async function createRail(detail: DayDetail | null, touchedSlot: string | null = null) {
  await TestBed.configureTestingModule({
    imports: [CalendarDetailRail],
    providers: [provideAnimationsAsync()],
  }).compileComponents();

  const fixture = TestBed.createComponent(CalendarDetailRail);
  fixture.componentRef.setInput('detail', detail);
  fixture.componentRef.setInput('touchedSlot', touchedSlot);
  fixture.detectChanges();
  return fixture;
}

/** Story 36.6 — une option de vote sur le créneau du matin, avec sa participation. */
const VOTE: AgendaEntry = {
  key: 'poll-p1-o1',
  type: 'votes-en-cours',
  date: '2026-08-20',
  label: 'Les Cendres d’Ashal',
  slot: 'MORNING',
  vote: {
    pollId: 'p1',
    optionId: 'o1',
    yes: 2,
    maybe: 1,
    no: 0,
    total: 4,
    myAnswer: 'YES',
  },
};

afterEach(() => TestBed.resetTestingModule());

describe('CalendarDetailRail — structure', () => {
  it('rend toujours trois lignes de créneau, même sur un jour vide (AC2/AC4)', async () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const lines = fixture.nativeElement.querySelectorAll('.it');
    expect(lines).toHaveLength(3);
  });

  it('rend la ligne « Matin » même quand seul le soir porte une séance', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelectorAll('.it')).toHaveLength(3);
    expect(text).toContain('Matin');
    expect(text).toContain('Après-midi');
    expect(text).toContain('Soir');
  });

  it('dit explicitement qu’un créneau ne porte rien plutôt que de rester vide (AC4)', async () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.textContent).toContain('Rien de prévu');
  });

  it('affiche le libellé du jour', async () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.querySelector('.dl').textContent).toContain('20 août');
  });

  it('nomme le créneau touché dans le libellé quand le geste en désignait un', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail, 'EVENING');

    expect(fixture.nativeElement.querySelector('.dl').textContent).toContain('soir');
  });

  it('ne nomme aucun créneau dans le libellé pour un tap FULL_DAY', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail, 'FULL_DAY');

    expect(fixture.nativeElement.querySelector('.dl').textContent).not.toContain('—');
  });
});

describe('CalendarDetailRail — accessibilité', () => {
  it('est une région live, pour un contenu qui change sans action explicite (AC10)', async () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const rail = fixture.nativeElement.querySelector('.rail');
    expect(rail.getAttribute('aria-live')).toBe('polite');
    expect(rail.getAttribute('role')).toBe('region');
  });

  it('masque les icônes de créneau aux lecteurs d’écran — le mot les nomme déjà', async () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const icons = fixture.nativeElement.querySelectorAll('svg.ic');
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('écrit l’état en toutes lettres, jamais par la seule couleur (AC8)', async () => {
    const decl = {
      id: 'd1',
      userId: 'u1',
      kind: 'AVAILABLE' as const,
      recurKind: 'PUNCTUAL' as const,
      dayOfWeek: null,
      slot: 'FULL_DAY' as const,
      startDate: '2026-08-20T00:00:00.000Z',
      endDate: '2026-08-20T00:00:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [decl], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.textContent).toContain('Disponible');
  });
});

describe('CalendarDetailRail — AC11 : activer une ligne ouvre le scénario', () => {
  it('rend un vrai bouton sur la ligne portant une séance', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const buttons = fixture.nativeElement.querySelectorAll('button.v--action');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('Le Convoi du Nord');
  });

  it('annonce l’ouverture du SCÉNARIO, pas de la séance', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const button = fixture.nativeElement.querySelector('button.v--action');
    expect(button.getAttribute('aria-label')).toBe('Ouvrir le scénario Le Convoi du Nord');
  });

  it('émet la cible du scénario au clic', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const emitted: unknown[] = [];
    fixture.componentInstance.scenarioActivated.subscribe((t) => emitted.push(t));

    fixture.nativeElement.querySelector('button.v--action').click();
    fixture.detectChanges();

    expect(emitted).toEqual([{ partieId: 'p1', scenarioId: 'sc1' }]);
  });

  it('s’active aussi au clavier — c’est un bouton natif, pas un div cliquable', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const button = fixture.nativeElement.querySelector('button.v--action');
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    // Un <button> est focalisable et activable à Entrée/Espace sans tabindex ni handler clavier.
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('ne rend AUCUN bouton sur les lignes sans séance — pas d’affordance morte', async () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
  });

  it('ne rend aucun bouton quand la couche « mes séances » est éteinte, mais garde l’indisponibilité (AC6)', async () => {
    const sansSeances = ALL_LAYERS.filter((l) => l !== 'mes-seances');
    const detail = buildDayDetail('2026-08-20', [SEANCE], sansSeances, [], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain('Le Convoi du Nord');
    expect(fixture.nativeElement.textContent).toContain('Indisponible');
  });
});

describe('CalendarDetailRail — état sans détail', () => {
  it('reste rendu et le dit, plutôt que de disparaître', async () => {
    const fixture = await createRail(null);

    expect(fixture.nativeElement.querySelector('.rail')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Aucun jour à détailler');
  });
});

// ─── Informations pratiques (Story 36.5, D-15 amendée) ───────────────────────

describe('CalendarDetailRail — informations pratiques', () => {
  const withInfos = (over: Partial<AgendaEntry>): AgendaEntry => ({ ...SEANCE, ...over });

  it('AC3 : les trois informations sont composées et rendues', async () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [
        withInfos({
          seanceHeure: '20:30',
          seanceLieu: 'chez Marc',
          seanceNote: 'pensez aux dés',
        }),
      ],
      ALL_LAYERS,
      [],
      NOW,
    );
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.textContent).toContain('20:30 · chez Marc · pensez aux dés');
  });

  it('AC4 : aucune information → aucun nœud accessoire n’est rendu', async () => {
    const detail = buildDayDetail('2026-08-20', [SEANCE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.querySelector('.v .m')).toBeNull();
  });

  it('AC4 : un seul champ → affiché seul, sans séparateur orphelin', async () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [withInfos({ label: 'Les Cendres d’Ashal', seanceLieu: 'en visio' })],
      ALL_LAYERS,
      [],
      NOW,
    );
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.querySelector('.v .m').textContent.trim()).toBe('en visio');
  });

  it('AC8 : couche « mes séances » éteinte → les informations disparaissent avec le titre', async () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [withInfos({ seanceHeure: '20:30', seanceLieu: 'chez Marc' })],
      ALL_LAYERS.filter((l) => l !== 'mes-seances'),
      [],
      NOW,
    );
    const fixture = await createRail(detail);

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('chez Marc');
    expect(text).not.toContain('20:30');
    // …mais le créneau reste indisponible (FR-50).
    expect(text).toContain('Indisponible');
  });

  it('AC9 : du balisage est rendu LITTÉRALEMENT, jamais interprété', async () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [withInfos({ seanceLieu: '<b>gras</b>' })],
      ALL_LAYERS,
      [],
      NOW,
    );
    const fixture = await createRail(detail);

    const node = fixture.nativeElement.querySelector('.v .m');
    expect(node.textContent).toContain('<b>gras</b>');
    expect(node.querySelector('b')).toBeNull();
  });
});

describe('CalendarDetailRail — piste de participation (Story 36.6)', () => {
  it('AC1 — la ligne d’un vote porte sa piste', async () => {
    const detail = buildDayDetail('2026-08-20', [VOTE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const matin = fixture.nativeElement.querySelectorAll('.it')[0] as HTMLElement;
    expect(matin.querySelector('app-poll-track')).toBeTruthy();
  });

  it('AC4 — le rail porte le compteur « 3 / 4 » à TOUTES les largeurs', async () => {
    const detail = buildDayDetail('2026-08-20', [VOTE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const matin = fixture.nativeElement.querySelectorAll('.it')[0] as HTMLElement;
    expect(matin.querySelector('.cnt')?.textContent?.trim()).toBe('3 / 4');
  });

  it('AC5 — ma réponse y est rappelée en toutes lettres', async () => {
    const detail = buildDayDetail('2026-08-20', [VOTE], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.textContent).toContain('tu as dit oui');
  });

  it('couche de votes éteinte : la piste disparaît avec le libellé', async () => {
    const sansVotes = ALL_LAYERS.filter((l) => l !== 'votes-en-cours');
    const detail = buildDayDetail('2026-08-20', [VOTE], sansVotes, [], NOW);
    const fixture = await createRail(detail);

    expect(fixture.nativeElement.querySelector('app-poll-track')).toBeNull();
  });

  it('encadré n°8 — une séance gagnante ne porte pas la piste d’un vote concurrent', async () => {
    const concurrent: AgendaEntry = { ...VOTE, slot: 'EVENING' };
    const detail = buildDayDetail('2026-08-20', [SEANCE, concurrent], ALL_LAYERS, [], NOW);
    const fixture = await createRail(detail);

    const soir = fixture.nativeElement.querySelectorAll('.it')[2] as HTMLElement;
    expect(soir.querySelector('app-poll-track')).toBeNull();
  });
});
