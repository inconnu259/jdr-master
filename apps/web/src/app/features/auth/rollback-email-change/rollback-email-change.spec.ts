import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RollbackEmailChange } from './rollback-email-change';
import { AuthService } from '../../../core/auth/auth.service';

function createFixture(token: string, rollbackEmailChange: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [RollbackEmailChange],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ token })),
          snapshot: { paramMap: convertToParamMap({ token }) },
        },
      },
      { provide: AuthService, useValue: { rollbackEmailChange } },
    ],
  });
  const fixture = TestBed.createComponent(RollbackEmailChange);
  fixture.detectChanges();
  return fixture;
}

describe('RollbackEmailChange', () => {
  it('lit le token depuis la route', () => {
    const fixture = createFixture('rb1.secret', vi.fn());
    const component = fixture.componentInstance as any;
    expect(component.token()).toBe('rb1.secret');
  });

  it('rollback() réussi → restored() à true, aucune redirection immédiate (revue de code)', async () => {
    const rollbackEmailChange = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture('rb1.secret', rollbackEmailChange);
    const component = fixture.componentInstance as any;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await component.rollback();

    expect(rollbackEmailChange).toHaveBeenCalledWith('rb1.secret');
    expect(component.restored()).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('continueToPasswordReset() → redirige vers /forgot-password', () => {
    const fixture = createFixture('rb1.secret', vi.fn());
    const component = fixture.componentInstance as any;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.continueToPasswordReset();

    expect(navigateSpy).toHaveBeenCalledWith(['/forgot-password']);
  });

  it('token invalide/expiré → message générique, aucune redirection', async () => {
    const rollbackEmailChange = vi.fn().mockRejectedValue(new Error('400'));
    const fixture = createFixture('bad.token', rollbackEmailChange);
    const component = fixture.componentInstance as any;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await component.rollback();

    expect(component.error()).toBeTruthy();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
