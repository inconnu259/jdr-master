import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { ScenarioDocumentDto, ScenarioDto } from '@master-jdr/shared';
import { ScenariosService } from './scenarios.service';
import { API_BASE as API } from '../api-base';

describe('ScenariosService', () => {
  let service: ScenariosService;
  let http: HttpTestingController;

  const scenario: ScenarioDto = {
    id: 's1',
    partieId: 'p1',
    title: 'Le Marché aux Ombres',
    description: null,
    status: 'BROUILLON',
    dureeHeures: null,
    dureeSeances: null,
    resumeFin: null,
    createdAt: '2026-07-12T00:00:00.000Z',
    closedAt: null,
  seances: [],
  };

  const document: ScenarioDocumentDto = {
    id: 'd1',
    partieId: 'p1',
    scenarioId: 's1',
    originalName: 'lettre.pdf',
    sizeBytes: 12,
    createdAt: '2026-07-12T00:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ScenariosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('create → POST /parties/:id/scenarios avec le payload', async () => {
    const dto = { title: 'Le Marché aux Ombres' };
    const p = service.create('p1', dto);
    const req = http.expectOne(`${API}/parties/p1/scenarios`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    expect(req.request.withCredentials).toBe(true);
    req.flush(scenario);
    expect(await p).toEqual(scenario);
  });

  it('update → PATCH /scenarios/:id avec le payload', async () => {
    const dto = { title: 'Nouveau titre' };
    const p = service.update('s1', dto);
    const req = http.expectOne(`${API}/scenarios/s1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(dto);
    req.flush({ ...scenario, title: 'Nouveau titre' });
    await p;
  });

  it('listDrafts → GET /parties/:id/scenarios/drafts', async () => {
    const p = service.listDrafts('p1');
    const req = http.expectOne(`${API}/parties/p1/scenarios/drafts`);
    expect(req.request.method).toBe('GET');
    req.flush([scenario]);
    expect(await p).toEqual([scenario]);
  });

  it('listAll → GET /parties/:id/scenarios', async () => {
    const p = service.listAll('p1');
    const req = http.expectOne(`${API}/parties/p1/scenarios`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([scenario]);
    expect(await p).toEqual([scenario]);
  });

  it('open → PATCH /scenarios/:id/open sans body', async () => {
    const p = service.open('s1');
    const req = http.expectOne(`${API}/scenarios/s1/open`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush({ ...scenario, status: 'A_VENIR' });
    await p;
  });

  it('markCourant → PATCH /scenarios/:id/courant sans body', async () => {
    const p = service.markCourant('s1');
    const req = http.expectOne(`${API}/scenarios/s1/courant`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...scenario, status: 'COURANT' });
    await p;
  });

  it('close → PATCH /scenarios/:id/passe sans body', async () => {
    const p = service.close('s1');
    const req = http.expectOne(`${API}/scenarios/s1/passe`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...scenario, status: 'PASSE', closedAt: '2026-07-13T10:00:00.000Z' });
    await p;
  });

  it('participate → POST /scenarios/:id/participate sans body', async () => {
    const p = service.participate('s1');
    const req = http.expectOne(`${API}/scenarios/s1/participate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...scenario, participants: [{ userId: 'u1', pseudo: 'Alice' }] });
    await p;
  });

  it('addSeance → POST /scenarios/:id/seances sans body', async () => {
    const p = service.addSeance('s1');
    const req = http.expectOne(`${API}/scenarios/s1/seances`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...scenario, seances: [{ id: 'seance1', scenarioId: 's1', compteRendu: null, createdAt: '2026-07-13T00:00:00.000Z' }] });
    await p;
  });

  it('linkSeancePoll → PATCH /scenarios/seances/:id/poll avec pollId', async () => {
    const p = service.linkSeancePoll('seance1', 'poll1');
    const req = http.expectOne(`${API}/scenarios/seances/seance1/poll`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ pollId: 'poll1' });
    expect(req.request.withCredentials).toBe(true);
    req.flush(scenario);
    await p;
  });

  it('uploadDocument avec scenarioId → POST multipart avec scenarioId dans le FormData', async () => {
    const file = new File(['%PDF-1.4'], 'lettre.pdf', { type: 'application/pdf' });
    const p = service.uploadDocument('p1', file, 's1');
    const req = http.expectOne(`${API}/parties/p1/documents`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('scenarioId')).toBe('s1');
    req.flush(document);
    expect(await p).toEqual(document);
  });

  it('uploadDocument sans scenarioId → FormData sans champ scenarioId', async () => {
    const file = new File(['%PDF-1.4'], 'lettre.pdf', { type: 'application/pdf' });
    const p = service.uploadDocument('p1', file);
    const req = http.expectOne(`${API}/parties/p1/documents`);
    const body = req.request.body as FormData;
    expect(body.has('scenarioId')).toBe(false);
    req.flush({ ...document, scenarioId: null });
    await p;
  });

  it('listDocuments → GET /scenarios/:id/documents', async () => {
    const p = service.listDocuments('s1');
    const req = http.expectOne(`${API}/scenarios/s1/documents`);
    expect(req.request.method).toBe('GET');
    req.flush([document]);
    expect(await p).toEqual([document]);
  });

  it('listLibraryDocuments → GET /parties/:id/documents', async () => {
    const p = service.listLibraryDocuments('p1');
    const req = http.expectOne(`${API}/parties/p1/documents`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(await p).toEqual([]);
  });

  it('downloadDocument → GET /documents/:id en blob', async () => {
    const p = service.downloadDocument('d1');
    const req = http.expectOne(`${API}/documents/d1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x']));
    await p;
  });
});
