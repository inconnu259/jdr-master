import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { PartieDto, SessionPollDto } from '@master-jdr/shared';
import { Dashboard } from './dashboard';
import { ModeService } from '../../core/mode/mode.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
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

async function createFixture(openPolls: Map<string, SessionPollDto>) {
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
      { provide: InvitationsService, useValue: { listReceived: vi.fn().mockResolvedValue([]) } },
      { provide: OpenPollsService, useValue: { openPolls: signal(openPolls) } },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Dashboard — badge de vote en attente', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("affiche le badge sur la carte d'une partie présente dans OpenPollsService.openPolls", async () => {
    const fixture = await createFixture(new Map([['p1', makePoll('p1')]]));
    const badges = fixture.nativeElement.querySelectorAll('.poll-badge');
    expect(badges.length).toBe(1);
  });

  it("n'affiche aucun badge si openPolls est vide", async () => {
    const fixture = await createFixture(new Map());
    const badges = fixture.nativeElement.querySelectorAll('.poll-badge');
    expect(badges.length).toBe(0);
  });
});
