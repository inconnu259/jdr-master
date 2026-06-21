import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import type { AuthUser } from '@master-jdr/shared';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

const user: AuthUser = {
  id: 'u1',
  email: 'a@b.c',
  pseudo: 'alice',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function run() {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('authGuard', () => {
  let auth: { initialized: ReturnType<typeof signal>; currentUser: ReturnType<typeof signal>; loadSession: () => Promise<void> };

  beforeEach(() => {
    auth = {
      initialized: signal(true),
      currentUser: signal<AuthUser | null>(null),
      loadSession: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  it('laisse passer si connecté', async () => {
    auth.currentUser.set(user);
    expect(await run()).toBe(true);
  });

  it('redirige (UrlTree) vers /login si non connecté', async () => {
    auth.currentUser.set(null);
    const result = await run();
    expect(result).toBeInstanceOf(UrlTree);
  });
});
