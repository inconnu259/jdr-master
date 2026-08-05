import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { AuthUser } from '@master-jdr/shared';
import { Account } from './account';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    email: 'alice@b.c',
    pseudo: 'alice',
    displayName: 'alice',
    role: 'USER',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeThemeService() {
  return {
    tone: () => ({
      'account.title': 'Mon grimoire personnel',
      'account.pseudo_label': 'Signe de reconnaissance',
      'account.email_label': 'Sceau de correspondance',
      'account.display_name_label': 'Nom affiché',
      'account.save_btn': 'Sceller',
      'account.saved': 'Le grimoire a retenu ce nom.',
      'account.error': "Le grimoire n'a pas pu retenir ce changement. Réessayez.",
    }),
  };
}

async function createFixture(
  currentUser = makeUser(),
  accountSvc = { updateDisplayName: vi.fn() },
) {
  const currentUserSignal = signal<AuthUser | null>(currentUser);
  await TestBed.configureTestingModule({
    imports: [Account],
    providers: [
      { provide: AuthService, useValue: { currentUser: currentUserSignal } },
      { provide: AccountService, useValue: accountSvc },
      { provide: ThemeToneService, useValue: makeThemeService() },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Account);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, currentUserSignal, accountSvc };
}

describe('Account', () => {
  it("le formulaire est pré-rempli depuis currentUser().displayName", async () => {
    const { fixture } = await createFixture(makeUser({ displayName: 'Alice au pays' }));
    const component = fixture.componentInstance as any;
    expect(component.form.value.displayName).toBe('Alice au pays');
  });

  it('affiche le pseudo et l’e-mail en lecture seule', async () => {
    const { fixture } = await createFixture(makeUser({ pseudo: 'alice', email: 'a@b.c' }));
    const component = fixture.componentInstance as any;
    expect(component.pseudo).toBe('alice');
    expect(component.email).toBe('a@b.c');
  });

  it('aucun champ ne permet de modifier le pseudo (pas de contrôle de formulaire pour pseudo)', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance as any;
    expect(component.form.contains('pseudo')).toBe(false);
    const readonlyPseudoInput = fixture.nativeElement.querySelector(
      'input[formControlName="pseudo"]',
    );
    expect(readonlyPseudoInput).toBeNull();
  });

  it('la soumission appelle AccountService.updateDisplayName() puis met à jour AuthService.currentUser', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn().mockResolvedValue(
        makeUser({ displayName: 'Nouveau nom' }),
      ),
    };
    const { fixture, currentUserSignal } = await createFixture(
      makeUser({ displayName: 'alice' }),
      accountSvc,
    );
    const component = fixture.componentInstance as any;

    component.form.setValue({ displayName: 'Nouveau nom' });
    await component.submit();

    expect(accountSvc.updateDisplayName).toHaveBeenCalledWith('Nouveau nom');
    expect(currentUserSignal()?.displayName).toBe('Nouveau nom');
    expect(component.saved()).toBe(true);
  });

  it('soumission avec un formulaire invalide (displayName vide) → le service n’est jamais appelé', async () => {
    const accountSvc = { updateDisplayName: vi.fn() };
    const { fixture } = await createFixture(makeUser({ displayName: 'alice' }), accountSvc);
    const component = fixture.componentInstance as any;

    component.form.setValue({ displayName: '' });
    await component.submit();

    expect(accountSvc.updateDisplayName).not.toHaveBeenCalled();
  });

  it('displayName composé uniquement d’espaces → formulaire invalide, service jamais appelé', async () => {
    const accountSvc = { updateDisplayName: vi.fn() };
    const { fixture } = await createFixture(makeUser({ displayName: 'alice' }), accountSvc);
    const component = fixture.componentInstance as any;

    component.form.setValue({ displayName: '   ' });
    expect(component.form.invalid).toBe(true);
    await component.submit();

    expect(accountSvc.updateDisplayName).not.toHaveBeenCalled();
  });

  it('les espaces en début/fin sont retirés avant l’appel au service', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn().mockResolvedValue(makeUser({ displayName: 'Nom valide' })),
    };
    const { fixture } = await createFixture(makeUser({ displayName: 'alice' }), accountSvc);
    const component = fixture.componentInstance as any;

    component.form.setValue({ displayName: '  Nom valide  ' });
    await component.submit();

    expect(accountSvc.updateDisplayName).toHaveBeenCalledWith('Nom valide');
  });

  it('échec de la soumission → error() renseigné, currentUser inchangé', async () => {
    const accountSvc = { updateDisplayName: vi.fn().mockRejectedValue(new Error('500')) };
    const { fixture, currentUserSignal } = await createFixture(
      makeUser({ displayName: 'alice' }),
      accountSvc,
    );
    const component = fixture.componentInstance as any;

    component.form.setValue({ displayName: 'Nouveau nom' });
    await component.submit();

    expect(component.error()).toBeTruthy();
    expect(currentUserSignal()?.displayName).toBe('alice');
  });
});
