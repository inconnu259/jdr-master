import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Register } from './register';
import { AuthService } from '../../../core/auth/auth.service';

async function createFixture(token: string | null) {
  const auth = {
    register: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
  };
  await TestBed.configureTestingModule({
    imports: [Register],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) },
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Register);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  const component = fixture.componentInstance as any;
  return { fixture, component, auth, navigate, el: fixture.nativeElement as HTMLElement };
}

describe('Register — inscription sur invitation (Story 34.2, non-régression)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('avec un jeton : le bouton est actif et l’inscription aboutit (register puis login)', async () => {
    const { fixture, component, auth, navigate, el } = await createFixture('jeton-valide');
    component.form.setValue({ email: 'a@b.c', pseudo: 'alice', password: 'motdepasse1' });
    fixture.detectChanges();

    const submit = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(el.querySelector('p.error')).toBeNull();

    await component.submit();

    expect(auth.register).toHaveBeenCalledWith('a@b.c', 'alice', 'motdepasse1', 'jeton-valide');
    expect(auth.login).toHaveBeenCalledWith('a@b.c', 'motdepasse1');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('sans jeton : message d’invitation inchangé, bouton désactivé, aucune inscription', async () => {
    const { fixture, component, auth, el } = await createFixture(null);
    component.form.setValue({ email: 'a@b.c', pseudo: 'alice', password: 'motdepasse1' });
    fixture.detectChanges();

    expect(el.querySelector('p.error')?.textContent).toContain(
      "L'inscription se fait uniquement sur invitation.",
    );
    expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);

    await component.submit();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('le champ de mot de passe est révélable, la valeur et l’autocomplete sont conservés', async () => {
    const { fixture, component, el } = await createFixture('jeton-valide');
    component.form.setValue({ email: 'a@b.c', pseudo: 'alice', password: 'motdepasse1' });
    const input = el.querySelector('input[formControlName="password"]') as HTMLInputElement;
    const button = el.querySelector('app-password-toggle button') as HTMLButtonElement;

    expect(input.type).toBe('password');
    button.click();
    fixture.detectChanges();

    expect(input.type).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(component.form.getRawValue().password).toBe('motdepasse1');
    expect(button.type).toBe('button');
  });

  it('le lien « J’ai déjà un compte » vers /login est conservé', async () => {
    const { el } = await createFixture('jeton-valide');
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('déjà un compte'),
    );
    expect(link?.getAttribute('href')).toBe('/login');
  });
});
