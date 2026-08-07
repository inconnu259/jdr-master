import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import type { AuthUser } from '@master-jdr/shared';
import { AccountService } from './account.service';
import { API_BASE } from '../api-base';

describe('AccountService', () => {
  let service: AccountService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AccountService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('updateDisplayName() appelle PATCH /me/display-name avec withCredentials et renvoie l’utilisateur', async () => {
    const promise = service.updateDisplayName('Nouveau nom');

    const req = http.expectOne(`${API_BASE}/me/display-name`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Nouveau nom' });
    expect(req.request.withCredentials).toBe(true);

    const response: AuthUser = {
      id: 'u1',
      email: 'a@b.c',
      pseudo: 'alice',
      displayName: 'Nouveau nom',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      theme: 'grimoire-emeraude',
    };
    req.flush(response);

    await expect(promise).resolves.toEqual(response);
  });

  it('setTheme() appelle PATCH /me/theme avec withCredentials et renvoie l’utilisateur', async () => {
    const promise = service.setTheme('foret-ancienne');

    const req = http.expectOne(`${API_BASE}/me/theme`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ theme: 'foret-ancienne' });
    expect(req.request.withCredentials).toBe(true);

    const response: AuthUser = {
      id: 'u1',
      email: 'a@b.c',
      pseudo: 'alice',
      displayName: 'alice',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      theme: 'foret-ancienne',
    };
    req.flush(response);

    await expect(promise).resolves.toEqual(response);
  });

  it('changePassword() appelle PATCH /me/password avec withCredentials', async () => {
    const promise = service.changePassword('oldpw', 'newpassword123');

    const req = http.expectOne(`${API_BASE}/me/password`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      currentPassword: 'oldpw',
      newPassword: 'newpassword123',
    });
    expect(req.request.withCredentials).toBe(true);

    req.flush({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });
});
