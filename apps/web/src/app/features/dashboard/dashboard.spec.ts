import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { AuthUser, PartieDto, SessionPollDto } from '@master-jdr/shared';
import { Dashboard } from './dashboard';
import { ModeService } from '../../core/mode/mode.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService, userTopic } from '../../core/realtime/realtime.service';
import { TONE_MAP } from '../../core/theme/tones';

function makeParty(id: string): PartieDto {
  return {
    id,
    name: `Party ${id}`,
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: 'mj-1',
    createdAt: '',
    nextSessionDate: null,
    nextSessionSlot: null,
  };
}

function makePoll(partieId: string): SessionPollDto {
  return {
    id: `poll-${partieId}`,
    partieId,
    status: 'OPEN',
    scenarioRef: null,
    expiresAt: null,
    chosenDate: null,
    chosenSlot: null,
    options: [],
  };
}

function makeInvitationsService(overrides: Partial<{ changed: ReturnType<typeof signal<number>> }> = {}) {
  return {
    listReceived: vi.fn().mockResolvedValue([]),
    accept: vi.fn(),
    decline: vi.fn(),
    // Story 21.1 (Task 4) : Dashboard réagit désormais à ce signal (effect() du constructeur).
    changed: signal(0),
    ...overrides,
  };
}

async function createFixture(
  openPolls: Map<string, SessionPollDto>,
  invitationsSvc = makeInvitationsService(),
) {
  // Story 21.1 (Task 4) : Dashboard ouvre désormais sa propre connexion RealtimeService — mock
  // direct, jsdom n'implémente pas EventSource.
  const realtimeSvc = { connect: vi.fn(), disconnect: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [Dashboard],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      {
        provide: ModeService,
        useValue: {
          mode: signal('joueur'),
          mjParties: signal([]),
          playerParties: signal([makeParty('p1'), makeParty('p2')]),
        },
      },
      { provide: InvitationsService, useValue: invitationsSvc },
      { provide: OpenPollsService, useValue: { openPolls: signal(openPolls) } },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'u1' } as AuthUser) } },
      { provide: RealtimeService, useValue: realtimeSvc },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, invitationsSvc, realtimeSvc };
}

describe('Dashboard — badge de vote en attente', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("affiche le badge sur la carte d'une partie présente dans OpenPollsService.openPolls", async () => {
    const { fixture } = await createFixture(new Map([['p1', makePoll('p1')]]));
    const badges = fixture.nativeElement.querySelectorAll('.poll-badge');
    expect(badges.length).toBe(1);
  });

  it("n'affiche aucun badge si openPolls est vide", async () => {
    const { fixture } = await createFixture(new Map());
    const badges = fixture.nativeElement.querySelectorAll('.poll-badge');
    expect(badges.length).toBe(0);
  });
});

describe('Dashboard — câblage temps réel (Story 21.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('connect() est appelé avec userTopic(currentUserId) au montage (AC1)', async () => {
    const { realtimeSvc } = await createFixture(new Map());
    expect(realtimeSvc.connect).toHaveBeenCalledWith(userTopic('u1'));
  });

  it('disconnect() est appelé à la destruction du composant', async () => {
    const { fixture, realtimeSvc } = await createFixture(new Map());
    fixture.destroy();
    expect(realtimeSvc.disconnect).toHaveBeenCalledTimes(1);
    expect(realtimeSvc.disconnect).toHaveBeenCalledWith(userTopic('u1'));
  });

  it('une notification InvitationsService.changed() recharge les invitations reçues (AC2)', async () => {
    const invitationsSvc = makeInvitationsService();
    const { fixture } = await createFixture(new Map(), invitationsSvc);
    const comp = fixture.componentInstance as any;
    const updated = [
      {
        id: 'inv1',
        partie: { id: 'p1', name: 'Ma Campagne', gameSystemId: 'ryuutama' },
        inviterPseudo: 'MJ',
        status: 'PENDING' as const,
        createdAt: '2026-07-22T00:00:00.000Z',
      },
    ];
    invitationsSvc.listReceived.mockResolvedValue(updated);

    invitationsSvc.changed.update((v) => v + 1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(comp.received()).toEqual(updated);
  });

  it('garde firstRun : un changed() déjà non-nul au montage ne déclenche PAS de refetch redondant', async () => {
    // InvitationsService est providedIn:'root' — son signal _changed peut déjà porter une valeur
    // non-nulle AVANT le montage (mutation locale antérieure dans la même session). Sans le garde
    // firstRun, ce cas déclencherait un refetch en plus de celui déjà fait par ngOnInit(). Dashboard
    // ne rend aucun enfant réagissant lui aussi à InvitationsService.changed — un compte exact de 1
    // est donc fiable ici.
    const invitationsSvc = makeInvitationsService({ changed: signal(1) });
    await createFixture(new Map(), invitationsSvc);

    expect(invitationsSvc.listReceived.mock.calls.length).toBe(1);
  });
});
