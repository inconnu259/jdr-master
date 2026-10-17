import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { EventCardDto, PartieMemberDto } from '@master-jdr/shared';
import { PartiesService } from '../../../core/parties/parties.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import { EventsApiService } from '../events-api.service';
import { EventDialog } from './event-dialog';

const TONE = TONE_MAP['grimoire-emeraude'];
const TODAY = '2026-10-17';
const HOST = 'host';
const ME = 'me';
const OTHER = 'other';

const member = (userId: string, displayName: string): PartieMemberDto => ({
  userId,
  pseudo: displayName.toLowerCase(),
  displayName,
  role: 'MEMBER',
  joinedAt: '2026-01-01T00:00:00.000Z',
});

/** Une conjonction à sondage : 3 créneaux, échéance le 20 octobre, votants éligibles donnés. */
function pollCard(over: Partial<EventCardDto['poll'] & object> = {}, host = HOST): EventCardDto {
  return {
    id: 'e1',
    title: 'Sondage plateaux',
    hostId: host,
    hostDisplayName: 'Léa',
    seance: {
      id: 's1',
      date: null,
      slot: null,
      lieu: null,
      heureRdv: null,
      notePratique: null,
      capacity: null,
      placesTaken: 1,
    },
    participants: [
      { userId: HOST, displayName: 'Léa', isHost: true, isAdmin: false, status: 'CONFIRMED' },
    ],
    myInscription: null,
    poll: {
      id: 'p1',
      expiresAt: '2026-10-20T23:59:59.999Z',
      status: 'OPEN',
      eligibleVoterIds: [HOST, ME, OTHER],
      options: [
        { id: 'o1', date: '2026-10-24', slot: 'EVENING', availableCount: 2 },
        { id: 'o2', date: '2026-10-25', slot: 'MORNING', availableCount: 1 },
        { id: 'o3', date: '2026-10-31', slot: 'EVENING', availableCount: 0 },
      ],
      votes: [],
      ...over,
    },
  };
}

@Component({
  imports: [EventDialog],
  template: `<app-event-dialog
    partieId="g1"
    [card]="card()"
    todayKey="2026-10-17"
    [currentUserId]="userId()"
  />`,
})
class Host {
  card = signal<EventCardDto>(pollCard());
  userId = signal<string | null>(ME);
}

describe('EventDialog — sondage de dates (Story 40.5)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('app-detail-surface').forEach((n) => n.remove());
  });

  async function mount(card: EventCardDto, userId: string | null = ME) {
    const api = {};
    const parties = {
      members: vi
        .fn()
        .mockResolvedValue([member(HOST, 'Léa'), member(ME, 'Moi'), member(OTHER, 'Zoé')]),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideNoopAnimations(),
        { provide: EventsApiService, useValue: api },
        { provide: PartiesService, useValue: parties },
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
        {
          provide: BreakpointObserver,
          useValue: {
            isMatched: () => true,
            observe: () => of({ matches: true, breakpoints: {} }),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.card.set(card);
    fixture.componentInstance.userId.set(userId);
    const settle = async () => {
      for (let i = 0; i < 8; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }
    };
    fixture.detectChanges();
    await settle();
    const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
    const text = (sel: string) => q(sel)?.textContent?.trim();
    return { fixture, settle, q, text, parties };
  }

  it('membre éligible qui n’a pas voté : cadre « à faire », « Vote à faire », « Vos réponses : 0 créneau sur 3 », aucun bouton de vote ni de date', async () => {
    const { q, text } = await mount(pollCard());

    expect(q('.ed__poll')?.classList).toContain('ed__poll--todo');
    expect(text('.ed__poll-text')).toBe(
      'Vote à faire. Vous êtes inscrit·e : donnez vos disponibilités avant le mar. 20 oct.',
    );
    expect(text('.ed__poll-answers')).toBe('Vos réponses : 0 créneau sur 3');
    expect(q('.ed__poll-best')).toBeNull();
    expect(q('.ed__poll-waiting')).toBeNull();
    // Le badge dit « Vote en cours » ; la ligne de date « Date à voter · jusqu’au … ».
    expect(text('.ed__badge')).toBe('Vote en cours');
    expect(text('.ed__big--date')).toBe('Date à voter · jusqu’au mar. 20 oct.');
    // Ni « Fixer la date », ni « Prolonger », ni « Voter dans le calendrier » à ce palier.
    const buttons = Array.from(document.body.querySelectorAll('.detail-surface-panel button')).map(
      (b) => b.textContent?.trim() ?? '',
    );
    expect(buttons.join('|')).not.toMatch(/Fixer|Prolonger|calendrier/);
  });

  it('membre qui a répondu : plus de cadre « à faire », ses réponses et le meilleur créneau sont écrits ; suit les réponses en direct', async () => {
    const card = pollCard({
      votes: [
        { optionId: 'o1', userId: ME, answer: 'YES' },
        { optionId: 'o2', userId: ME, answer: 'NO' },
        { optionId: 'o1', userId: HOST, answer: 'YES' },
      ],
    });
    const { fixture, settle, q, text } = await mount(card);

    expect(q('.ed__poll')?.classList).not.toContain('ed__poll--todo');
    expect(text('.ed__poll-text')).toBe(
      'Vos réponses sont enregistrées. Le vote se termine le mar. 20 oct.',
    );
    expect(text('.ed__poll-answers')).toBe('Vos réponses : 2 créneaux sur 3');
    expect(text('.ed__poll-best')).toBe(
      'Meilleur créneau pour l’instant : sam. 24 oct. · soir — 2 oui',
    );
    expect(text('.ed__badge')).toBe('Vote en cours');

    // Une réponse arrive en direct (liste vivante) : le meilleur créneau change sans rechargement.
    fixture.componentInstance.card.set(
      pollCard({
        votes: [
          { optionId: 'o1', userId: ME, answer: 'YES' },
          { optionId: 'o1', userId: HOST, answer: 'YES' },
          { optionId: 'o2', userId: ME, answer: 'YES' },
          { optionId: 'o2', userId: HOST, answer: 'YES' },
          { optionId: 'o2', userId: OTHER, answer: 'YES' },
        ],
      }),
    );
    await settle();
    expect(text('.ed__poll-best')).toBe(
      'Meilleur créneau pour l’instant : dim. 25 oct. · matin — 3 oui',
    );
  });

  it('hôte : cadre accent, « Vous êtes l’hôte… dans 3 jours — 3 créneaux proposés », réponses x sur N, meilleur créneau et qui n’a pas répondu', async () => {
    const card = pollCard({
      votes: [
        { optionId: 'o1', userId: HOST, answer: 'YES' },
        { optionId: 'o1', userId: ME, answer: 'YES' },
      ],
    });
    const { q, text } = await mount(card, HOST);

    expect(q('.ed__poll')?.classList).toContain('ed__poll--host');
    expect(text('.ed__poll-text')).toBe(
      'Vous êtes l’hôte. Le vote se termine dans 3 jours — 3 créneaux proposés.',
    );
    expect(text('.ed__poll-answers')).toBe('Réponses : 2 sur 3');
    expect(text('.ed__poll-best')).toContain('2 oui');
    // Les noms viennent des membres du groupe (« Tous les membres » : Zoé n’est pas dans les participants).
    expect(text('.ed__poll-waiting')).toBe('N’ont pas encore répondu : Zoé');
  });

  it('hôte : le panneau se met à jour quand le dernier répond (plus de ligne « n’ont pas encore répondu »)', async () => {
    const { fixture, settle, q } = await mount(pollCard(), HOST);
    expect(q('.ed__poll-waiting')?.textContent).toContain('Léa, Moi, Zoé');

    fixture.componentInstance.card.set(
      pollCard({
        votes: [
          { optionId: 'o1', userId: HOST, answer: 'YES' },
          { optionId: 'o1', userId: ME, answer: 'MAYBE' },
          { optionId: 'o1', userId: OTHER, answer: 'NO' },
        ],
      }),
    );
    await settle();
    expect(q('.ed__poll-waiting')).toBeNull();
    expect(q('.ed__poll-answers')?.textContent?.trim()).toBe('Réponses : 3 sur 3');
  });

  it('membre non éligible (places limitées, pas inscrit) : l’information est écrite, badge cyan', async () => {
    const card = pollCard({ eligibleVoterIds: [HOST] });
    const { q, text } = await mount(card);

    expect(text('.ed__poll-text')).toBe(TONE['partie.ralliement_event_poll_not_eligible']);
    expect(q('.ed__poll')?.classList).not.toContain('ed__poll--todo');
    expect(q('.ed__poll-answers')).toBeNull();
    expect(q('.ed__badge .status-badge--live')).not.toBeNull();
  });

  it('badge « Vote en cours » : orange pour qui doit voter, cyan sinon', async () => {
    const todo = await mount(pollCard());
    expect(todo.q('.ed__badge .status-badge--todo')).not.toBeNull();
    TestBed.resetTestingModule();
    document.body.querySelectorAll('app-detail-surface').forEach((n) => n.remove());

    const done = await mount(pollCard({ votes: [{ optionId: 'o1', userId: ME, answer: 'YES' }] }));
    expect(done.q('.ed__badge .status-badge--live')).not.toBeNull();
    expect(done.q('.ed__badge .status-badge--todo')).toBeNull();
  });

  it('vote terminé (échéance dépassée) : « Le vote est terminé. » à la place de « Vote à faire »', async () => {
    const { text, q } = await mount(pollCard({ expiresAt: '2026-10-16T23:59:59.999Z' }));
    expect(text('.ed__poll-text')).toBe(TONE['partie.ralliement_event_poll_ended']);
    expect(q('.ed__poll')?.classList).not.toContain('ed__poll--todo');
    // Plus de « Vote en cours » : le badge retombe sur « À venir ».
    expect(text('.ed__badge')).not.toBe('Vote en cours');
  });

  it('la fiche liste chaque créneau candidat avec le nombre d’inscrits libres', async () => {
    const { q } = await mount(pollCard());
    const rows = Array.from(document.body.querySelectorAll('.ed__slot')).map((r) => [
      r.querySelector('.ed__slot-label')?.textContent?.trim(),
      r.querySelector('.ed__slot-available')?.textContent?.trim(),
    ]);
    expect(rows).toEqual([
      ['sam. 24 oct. · soir', '2 inscrits disponibles'],
      ['dim. 25 oct. · matin', '1 inscrit disponible'],
      ['sam. 31 oct. · soir', '0 inscrit disponible'],
    ]);
    expect(q('.ed__slots h3')?.textContent?.trim()).toBe(
      TONE['partie.ralliement_event_poll_slots_heading'],
    );
  });

  it('une conjonction à date fixée n’a ni panneau de sondage ni liste de créneaux', async () => {
    const dated: EventCardDto = {
      ...pollCard(),
      poll: null,
      seance: { ...pollCard().seance!, date: '2026-10-24', slot: 'EVENING' },
    };
    const { q } = await mount(dated);
    expect(q('.ed__poll')).toBeNull();
    expect(q('.ed__slots')).toBeNull();
    expect(TODAY).toBe('2026-10-17');
  });

  it('l’hôte lit les membres du groupe une seule fois (noms des absents) ; un simple membre n’en lit aucun', async () => {
    const host = await mount(pollCard(), HOST);
    expect(host.parties.members).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    document.body.querySelectorAll('app-detail-surface').forEach((n) => n.remove());

    const guest = await mount(pollCard(), ME);
    expect(guest.parties.members).not.toHaveBeenCalled();
  });
});
