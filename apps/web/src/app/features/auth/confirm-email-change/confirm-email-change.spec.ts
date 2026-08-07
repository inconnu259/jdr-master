import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ConfirmEmailChange } from './confirm-email-change';
import { AuthService } from '../../../core/auth/auth.service';

function createFixture(token: string, confirmEmailChange: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [ConfirmEmailChange],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ token })),
          snapshot: { paramMap: convertToParamMap({ token }) },
        },
      },
      { provide: AuthService, useValue: { confirmEmailChange } },
    ],
  });
  const fixture = TestBed.createComponent(ConfirmEmailChange);
  fixture.detectChanges();
  return fixture;
}

describe('ConfirmEmailChange', () => {
  it('lit le token depuis la route', () => {
    const fixture = createFixture('tok1.secret', vi.fn());
    const component = fixture.componentInstance as any;
    expect(component.token()).toBe('tok1.secret');
  });

  it('confirm() réussi → confirmed() à true, aucune erreur', async () => {
    const confirmEmailChange = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture('tok1.secret', confirmEmailChange);
    const component = fixture.componentInstance as any;

    await component.confirm();

    expect(confirmEmailChange).toHaveBeenCalledWith('tok1.secret');
    expect(component.confirmed()).toBe(true);
    expect(component.error()).toBeNull();
  });

  it('token invalide/expiré → message générique, confirmed() reste false', async () => {
    const confirmEmailChange = vi.fn().mockRejectedValue(new Error('400'));
    const fixture = createFixture('bad.token', confirmEmailChange);
    const component = fixture.componentInstance as any;

    await component.confirm();

    expect(component.error()).toBeTruthy();
    expect(component.confirmed()).toBe(false);
  });
});
