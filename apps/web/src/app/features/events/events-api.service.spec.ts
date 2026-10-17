import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { EventCardDto } from '@master-jdr/shared';
import { API_BASE as API } from '../../core/api-base';
import { EventsApiService } from './events-api.service';

describe('EventsApiService (Story 40.1)', () => {
  let service: EventsApiService;
  let http: HttpTestingController;

  const card: EventCardDto = {
    id: 'e1',
    title: 'Catane',
    hostId: 'u1',
    hostDisplayName: 'Léa',
    seance: null,
    participants: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list → GET /parties/:id/events/list (jamais le flux SSE /events), avec withCredentials', async () => {
    const p = service.list('p1');
    const req = http.expectOne(`${API}/parties/p1/events/list`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([card]);
    expect(await p).toEqual([card]);
  });

  it('create → POST /parties/:id/events avec le payload', async () => {
    const dto = { title: 'Catane', date: '2031-10-10', slot: 'EVENING' as const, capacity: null };
    const p = service.create('p1', dto);
    const req = http.expectOne(`${API}/parties/p1/events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual(dto);
    req.flush(card);
    expect(await p).toEqual(card);
  });

  it('update → PATCH /parties/:id/events/:eventId avec le payload complet (Story 40.2)', async () => {
    const dto = { title: 'Catane', date: '2031-10-10', slot: 'MORNING' as const, capacity: 6 };
    const p = service.update('p1', 'e1', dto);
    const req = http.expectOne(`${API}/parties/p1/events/e1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual(dto);
    req.flush(card);
    expect(await p).toEqual(card);
  });
});
