import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { AuthUser } from '@master-jdr/shared';
import { AuthService } from './auth.service';

const API = 'http://localhost:3000';

describe('AuthService (front)', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const user: AuthUser = {
    id: 'u1',
    email: 'a@b.c',
    pseudo: 'alice',
    role: 'USER',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login met currentUser et envoie le cookie (withCredentials)', async () => {
    const p = service.login('a@b.c', 'pw');
    const req = http.expectOne(`${API}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush(user);
    await p;
    expect(service.currentUser()).toEqual(user);
  });

  it('logout vide currentUser', async () => {
    service.currentUser.set(user);
    const p = service.logout();
    http.expectOne(`${API}/auth/logout`).flush({ ok: true });
    await p;
    expect(service.currentUser()).toBeNull();
  });

  it('loadSession est dédupliqué (un seul /auth/me malgré 2 appels)', async () => {
    const p1 = service.loadSession();
    const p2 = service.loadSession();
    const reqs = http.match(`${API}/auth/me`);
    expect(reqs.length).toBe(1);
    reqs[0].flush(user);
    await Promise.all([p1, p2]);
    expect(service.currentUser()).toEqual(user);
    expect(service.initialized()).toBe(true);
  });
});
