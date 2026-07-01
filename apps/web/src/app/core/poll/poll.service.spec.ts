import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import type { CastVoteDto, ChooseDateDto } from '@master-jdr/shared';
import { PollService } from './poll.service';

describe('PollService', () => {
  let service: PollService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PollService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAvailableSlots sans weeks appelle /parties/:id/available-slots', async () => {
    const promise = service.getAvailableSlots('p1');
    const req = http.expectOne('http://localhost:3000/parties/p1/available-slots');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
    await promise;
  });

  it('getAvailableSlots avec weeks=4 appelle /parties/:id/available-slots?weeks=4', async () => {
    const promise = service.getAvailableSlots('p1', 4);
    const req = http.expectOne('http://localhost:3000/parties/p1/available-slots?weeks=4');
    expect(req.request.method).toBe('GET');
    req.flush([]);
    await promise;
  });

  it('getAvailableSlots avec from/to appelle la bonne URL', async () => {
    const promise = service.getAvailableSlots('p1', undefined, '2026-08-01', '2026-08-31');
    const req = http.expectOne('http://localhost:3000/parties/p1/available-slots?from=2026-08-01&to=2026-08-31');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
    await promise;
  });

  it('castVote appelle POST /parties/p1/poll/poll1/vote avec le DTO', async () => {
    const dto: CastVoteDto = { optionId: 'opt1', answer: 'YES' };
    const promise = service.castVote('p1', 'poll1', dto);
    const req = http.expectOne('http://localhost:3000/parties/p1/poll/poll1/vote');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(null);
    await promise;
  });

  it('chooseDate appelle PATCH /parties/p1/poll/poll1/choose avec le DTO', async () => {
    const dto: ChooseDateDto = { optionId: 'opt1' };
    const promise = service.chooseDate('p1', 'poll1', dto);
    const req = http.expectOne('http://localhost:3000/parties/p1/poll/poll1/choose');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(dto);
    req.flush(null);
    await promise;
  });

  it('createPoll appelle POST /parties/p1/poll avec le DTO', async () => {
    const dto = {
      options: [
        { date: '2026-08-01', slot: 'MORNING' as const },
        { date: '2026-08-08', slot: 'AFTERNOON' as const },
      ],
    };
    const fakePoll = {
      id: 'poll1', partieId: 'p1', status: 'OPEN' as const, scenarioRef: null,
      expiresAt: null, chosenDate: null, chosenSlot: null, options: [],
    };
    const promise = service.createPoll('p1', dto);
    const req = http.expectOne('http://localhost:3000/parties/p1/poll');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(fakePoll);
    const result = await promise;
    expect(result.id).toBe('poll1');
  });
});
