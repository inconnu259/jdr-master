import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { PartieDto } from '@master-jdr/shared';
import { PartiesService } from './parties.service';
import { API_BASE as API } from '../api-base';

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
    mjPseudo: 'mj-pseudo',
    mjDisplayName: 'MJ Nom',
    createdAt: '2026-01-01T00:00:00.000Z',
    nextSessionDate: null,
    nextSessionSlot: null,
    role: 'mj',
    status: 'EN_COURS',
    isFavorite: false,
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

  it('close → PATCH /parties/:id/close avec withCredentials (Story 29.6)', async () => {
    const p = service.close('p1');
    const req = http.expectOne(`${API}/parties/p1/close`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...partie, status: 'TERMINEE' });
    expect((await p).status).toBe('TERMINEE');
  });

  it('reopen → PATCH /parties/:id/reopen avec withCredentials (Story 29.6)', async () => {
    const p = service.reopen('p1');
    const req = http.expectOne(`${API}/parties/p1/reopen`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    req.flush(partie);
    expect(await p).toEqual(partie);
  });

  it('notifyChanged() incrémente changed() (Story 18.3, AD-4)', () => {
    expect(service.changed()).toBe(0);
    service.notifyChanged();
    expect(service.changed()).toBe(1);
    service.notifyChanged();
    expect(service.changed()).toBe(2);
  });
});
