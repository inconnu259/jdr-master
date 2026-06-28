import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { PartieDto } from '@master-jdr/shared';
import { PartiesService } from './parties.service';

const API = 'http://localhost:3000';

describe('PartiesService (front)', () => {
  let service: PartiesService;
  let http: HttpTestingController;

  const partie: PartieDto = {
    id: 'p1',
    name: 'La Nuit',
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: 'mj1',
    createdAt: '2026-01-01T00:00:00.000Z',
    nextSessionDate: null,
    nextSessionSlot: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PartiesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list(mj) → GET /parties?role=mj avec withCredentials', async () => {
    const p = service.list('mj');
    const req = http.expectOne(`${API}/parties?role=mj`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([partie]);
    expect(await p).toEqual([partie]);
  });

  it('create → POST avec le payload', async () => {
    const payload = { name: 'La Nuit', kind: 'ONE_SHOT' as const, gameSystemId: 'draconis' };
    const p = service.create(payload);
    const req = http.expectOne(`${API}/parties`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(partie);
    expect(await p).toEqual(partie);
  });

  it('remove → DELETE /parties/:id', async () => {
    const p = service.remove('p1');
    const req = http.expectOne(`${API}/parties/p1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await p;
  });
});
