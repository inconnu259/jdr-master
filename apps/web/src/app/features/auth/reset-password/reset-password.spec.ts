import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ResetPassword } from './reset-password';
import { AuthService } from '../../../core/auth/auth.service';

async function createFixture(token: string | null) {
  const auth = { resetPassword: vi.fn().mockResolvedValue(undefined) };
  const paramMap = convertToParamMap(token ? { token } : {});
  await TestBed.configureTestingModule({
    imports: [ResetPassword],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ResetPassword);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ResetPassword — champ révélable (Story 34.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('le nouveau mot de passe est révélable puis re-masquable, autocomplete conservé', async () => {
    const { fixture, el } = await createFixture('jeton-valide');
    const input = el.querySelector('input[formControlName="newPassword"]') as HTMLInputElement;
    const button = el.querySelector('app-password-toggle button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.type).toBe('button');

    expect(input.type).toBe('password');
    button.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(input.getAttribute('autocomplete')).toBe('new-password');

    button.click();
    fixture.detectChanges();
    expect(input.type).toBe('password');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
  });

  it('sans jeton : lien invalide affiché et bouton de soumission désactivé', async () => {
    const { el } = await createFixture(null);
    expect(el.querySelector('p.error')?.textContent).toContain('Lien invalide');
    expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
