import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { InvitationDto } from '@master-jdr/shared';
import { InvitationsService } from './invitations.service';

// Ce service utilise `const API = 'http://localhost:3000';` en dur (pas `API_BASE` importé de
// `../api-base`, incohérence pré-existante non corrigée par la Story 21.1) — reproduire cette
// même chaîne littérale ici plutôt que d'importer `API_BASE`.
const API = 'http://localhost:3000';

const INVITATION: InvitationDto = {
  id: 'inv1',
  partie: { id: 'p1', name: 'Ma Campagne', gameSystemId: 'ryuutama' },
  inviterPseudo: 'MJ',
  status: 'PENDING',
  createdAt: '2026-07-22T00:00:00.000Z',
};

describe('InvitationsService (front)', () => {
  let service: InvitationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InvitationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listReceived() → GET /invitations avec withCredentials', async () => {
    const p = service.listReceived();
    const req = http.expectOne(`${API}/invitations`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([INVITATION]);
    expect(await p).toEqual([INVITATION]);
  });

  it('accept(id) → POST /invitations/:id/accept avec withCredentials', async () => {
    const p = service.accept('inv1');
    const req = http.expectOne(`${API}/invitations/inv1/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
    await expect(p).resolves.toBeDefined();
  });

  it('decline(id) → POST /invitations/:id/decline avec withCredentials', async () => {
    const p = service.decline('inv1');
    const req = http.expectOne(`${API}/invitations/inv1/decline`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
    await expect(p).resolves.toBeDefined();
  });

  it('notifyChanged() incrémente changed() (Story 21.1)', () => {
    const before = service.changed();
    service.notifyChanged();
    expect(service.changed()).toBe(before + 1);
  });
});
