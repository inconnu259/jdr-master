import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { Shell } from './shell';
import { AuthService } from '../../core/auth/auth.service';
import { ModeService } from '../../core/mode/mode.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../core/theme/tones';

async function createFixture(openPollsCount: number) {
  await TestBed.configureTestingModule({
    imports: [Shell],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({
            id: 'u1',
            pseudo: 'Test',
            email: 'test@test.com',
            role: 'USER',
            createdAt: '',
          }),
          logout: vi.fn(),
        },
      },
      {
        provide: ModeService,
        useValue: {
          mode: signal('joueur'),
          hasMjParties: signal(false),
          setMode: vi.fn(),
          refreshMjParties: vi.fn().mockResolvedValue(undefined),
          refreshPlayerParties: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: OpenPollsService, useValue: { count: signal(openPollsCount) } },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Shell);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('Shell — badge de vote en attente dans la navigation', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche le badge avec le bon compte quand des polls sont ouverts', async () => {
    const fixture = await createFixture(3);
    expect((fixture.componentInstance as any).openPollsCount()).toBe(3);
    const button = fixture.nativeElement.querySelector('button[aria-label="Menu utilisateur"]');
    expect(button.classList.contains('mat-badge-hidden')).toBe(false);
    const content = button.querySelector('.mat-badge-content');
    expect(content?.textContent?.trim()).toBe('3');
  });

  it('masque le badge quand le compte est 0', async () => {
    const fixture = await createFixture(0);
    expect((fixture.componentInstance as any).openPollsCount()).toBe(0);
    const button = fixture.nativeElement.querySelector('button[aria-label="Menu utilisateur"]');
    expect(button.classList.contains('mat-badge-hidden')).toBe(true);
  });
});
