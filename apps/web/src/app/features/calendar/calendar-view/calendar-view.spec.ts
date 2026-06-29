import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { CalendarView } from './calendar-view';
import { ActivatedRoute } from '@angular/router';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { PollService } from '../../../core/poll/poll.service';

function makeActivatedRoute() {
  return {
    snapshot: {
      paramMap:      { get: () => null },
      queryParamMap: { get: () => null },
    },
  };
}

function makeAvailabilityService() {
  return { getMyDeclarations: vi.fn().mockResolvedValue([]) };
}

function makePollService() {
  return {
    getAvailableSlots: vi.fn().mockResolvedValue([]),
    getHeatmap:        vi.fn().mockResolvedValue([]),
  };
}

async function createCalendarView(mode?: 'mj' | 'personal') {
  await TestBed.configureTestingModule({
    imports: [CalendarView],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: ActivatedRoute,      useValue: makeActivatedRoute() },
      { provide: AvailabilityService, useValue: makeAvailabilityService() },
      { provide: PollService,         useValue: makePollService() },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CalendarView);
  if (mode) fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('CalendarView — signal mode', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('isMjMode() retourne true quand mode="mj"', async () => {
    const fixture = await createCalendarView('mj');
    expect((fixture.componentInstance as any).isMjMode()).toBe(true);
  });

  it('isMjMode() retourne false avec le mode par défaut ("personal")', async () => {
    const fixture = await createCalendarView();
    expect((fixture.componentInstance as any).isMjMode()).toBe(false);
  });
});
