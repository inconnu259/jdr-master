import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import type { AuthUser } from '@master-jdr/shared';
import { Account } from './account';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { ContextualNavService } from '../../core/navigation/contextual-nav.service';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    email: 'alice@b.c',
    pseudo: 'alice',
    displayName: 'alice',
    role: 'USER',
    createdAt: '2026-01-01T00:00:00.000Z',
    theme: 'grimoire-emeraude',
    hideFinishedParties: false,
    partiesSort: 'urgence',
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
      'account.cancel_btn': 'Renoncer',
      'account.saved': 'Le grimoire a retenu ce nom.',
      'account.error': "Le grimoire n'a pas pu retenir ce changement. Réessayez.",
      'account.password_title': 'Changer de mot de passe',
      'account.current_password_label': 'Mot de passe actuel',
      'account.new_password_label': 'Nouveau mot de passe',
      'account.password_save_btn': 'Changer',
      'account.password_saved': 'Le mot de passe a été changé.',
      'account.password_wrong_current': 'Mot de passe actuel incorrect.',
      'account.password_error': 'Le changement a échoué. Réessayez.',
      'account.email_change_title': "Changer d'adresse e-mail",
      'account.current_password_for_email_label': 'Mot de passe actuel',
      'account.new_email_label': 'Nouvelle adresse e-mail',
      'account.email_change_save_btn': 'Envoyer la demande',
      'account.email_change_saved': 'Vérifiez votre nouvelle boîte mail pour confirmer.',
      'account.email_change_wrong_current': 'Mot de passe actuel incorrect.',
      'account.email_change_taken': 'Cette adresse est déjà utilisée par un autre compte.',
      'account.email_change_error': 'La demande a échoué. Réessayez.',
      'nav.logout': 'Fermer le grimoire',
    }),
    // ThemeSelector (intégré à l'écran de compte, Story 28.4) a besoin de ces membres.
    activeTheme: signal('grimoire-emeraude'),
    themes: ['grimoire-emeraude', 'foret-ancienne', 'medieval-steampunk'],
    themeNames: {
      'grimoire-emeraude': 'Grimoire Émeraude',
      'foret-ancienne': 'Forêt Ancienne',
      'medieval-steampunk': 'Médiéval Steampunk',
    },
    setTheme: vi.fn(),
  };
}

async function createFixture(
  currentUser = makeUser(),
  accountSvc: Record<string, ReturnType<typeof vi.fn>> = {
    updateDisplayName: vi.fn(),
    setTheme: vi.fn(),
    changePassword: vi.fn(),
    requestEmailChange: vi.fn(),
  },
) {
  const currentUserSignal = signal<AuthUser | null>(currentUser);
  const authSvc = { currentUser: currentUserSignal, logout: vi.fn().mockResolvedValue(undefined) };
  await TestBed.configureTestingModule({
    imports: [Account],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: authSvc },
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
  return { fixture, currentUserSignal, accountSvc, authSvc };
}

describe('Account — nom affiché (crayon d’édition, revue de code)', () => {
  it('affiche le pseudo et le nom affiché en lecture seule (avec crayon)', async () => {
    const { fixture } = await createFixture(
      makeUser({ pseudo: 'alice', displayName: 'Alice au pays' }),
    );
    const component = fixture.componentInstance as any;
    expect(component.pseudo).toBe('alice');
    expect(component.displayName).toBe('Alice au pays');
    expect(fixture.nativeElement.querySelector('app-field-edit-pencil')).not.toBeNull();
  });

  it('aucun champ ne permet de modifier le pseudo', async () => {
    const { fixture } = await createFixture();
    const readonlyPseudoInput = fixture.nativeElement.querySelector(
      'input[formControlName="pseudo"]',
    );
    expect(readonlyPseudoInput).toBeNull();
  });

  it('onDisplayNameConfirm() appelle AccountService.updateDisplayName() puis met à jour AuthService.currentUser', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn().mockResolvedValue(makeUser({ displayName: 'Nouveau nom' })),
    };
    const { fixture, currentUserSignal } = await createFixture(
      makeUser({ displayName: 'alice' }),
      accountSvc,
    );
    const component = fixture.componentInstance as any;

    await component.onDisplayNameConfirm('Nouveau nom');

    expect(accountSvc.updateDisplayName).toHaveBeenCalledWith('Nouveau nom');
    expect(currentUserSignal()?.displayName).toBe('Nouveau nom');
    expect(component.saved()).toBe(true);
  });

  it('valeur vide → error() renseigné, service jamais appelé', async () => {
    const accountSvc = { updateDisplayName: vi.fn() };
    const { fixture } = await createFixture(makeUser({ displayName: 'alice' }), accountSvc);
    const component = fixture.componentInstance as any;

    await component.onDisplayNameConfirm('   ');

    expect(accountSvc.updateDisplayName).not.toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
  });

  it('valeur > 60 caractères → error() renseigné, service jamais appelé', async () => {
    const accountSvc = { updateDisplayName: vi.fn() };
    const { fixture } = await createFixture(makeUser({ displayName: 'alice' }), accountSvc);
    const component = fixture.componentInstance as any;

    await component.onDisplayNameConfirm('x'.repeat(61));

    expect(accountSvc.updateDisplayName).not.toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
  });

  it('les espaces en début/fin sont retirés avant l’appel au service', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn().mockResolvedValue(makeUser({ displayName: 'Nom valide' })),
    };
    const { fixture } = await createFixture(makeUser({ displayName: 'alice' }), accountSvc);
    const component = fixture.componentInstance as any;

    await component.onDisplayNameConfirm('  Nom valide  ');

    expect(accountSvc.updateDisplayName).toHaveBeenCalledWith('Nom valide');
  });

  it('échec de la soumission → error() renseigné, currentUser inchangé', async () => {
    const accountSvc = { updateDisplayName: vi.fn().mockRejectedValue(new Error('500')) };
    const { fixture, currentUserSignal } = await createFixture(
      makeUser({ displayName: 'alice' }),
      accountSvc,
    );
    const component = fixture.componentInstance as any;

    await component.onDisplayNameConfirm('Nouveau nom');

    expect(component.error()).toBeTruthy();
    expect(currentUserSignal()?.displayName).toBe('alice');
  });
});

describe('Account — changement de mot de passe (page sobre, revue de code)', () => {
  it('par défaut, aucun champ de mot de passe visible — seulement un bouton', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance as any;

    expect(component.editingPassword()).toBe(false);
    expect(fixture.nativeElement.querySelector('input[formControlName="newPassword"]')).toBeNull();
  });

  it('startPasswordEdit() révèle les champs', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance as any;

    component.startPasswordEdit();
    fixture.detectChanges();

    expect(component.editingPassword()).toBe(true);
  });

  it('cancelPasswordEdit() réinitialise le formulaire et referme la section', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance as any;

    component.startPasswordEdit();
    component.passwordForm.setValue({ currentPassword: 'a', newPassword: 'newpassword123' });
    component.cancelPasswordEdit();

    expect(component.editingPassword()).toBe(false);
    expect(component.passwordForm.value.currentPassword).toBeFalsy();
  });

  it('soumission valide → AccountService.changePassword appelé, formulaire réinitialisé, succès affiché, section repliée', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn().mockResolvedValue({ ok: true }),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startPasswordEdit();
    component.passwordForm.setValue({
      currentPassword: 'oldpw',
      newPassword: 'newpassword123',
    });
    await component.submitPassword();

    expect(accountSvc.changePassword).toHaveBeenCalledWith('oldpw', 'newpassword123');
    expect(component.passwordForm.value.currentPassword).toBeFalsy();
    expect(component.passwordForm.value.newPassword).toBeFalsy();
    expect(component.passwordSaved()).toBe(true);
    expect(component.editingPassword()).toBe(false);
  });

  it('mot de passe courant incorrect (401) → message spécifique, formulaire non réinitialisé, section reste ouverte', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 401 })),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startPasswordEdit();
    component.passwordForm.setValue({
      currentPassword: 'wrongpw',
      newPassword: 'newpassword123',
    });
    await component.submitPassword();

    expect(component.passwordError()).toBe('Mot de passe actuel incorrect.');
    expect(component.passwordForm.value.currentPassword).toBe('wrongpw');
    expect(component.editingPassword()).toBe(true);
  });

  it('échec réseau/serveur (non 401) → message générique', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 500 })),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startPasswordEdit();
    component.passwordForm.setValue({
      currentPassword: 'oldpw',
      newPassword: 'newpassword123',
    });
    await component.submitPassword();

    expect(component.passwordError()).toBe('Le changement a échoué. Réessayez.');
  });

  it('newPassword < 8 caractères → formulaire invalide, service jamais appelé', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn(),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startPasswordEdit();
    component.passwordForm.setValue({ currentPassword: 'oldpw', newPassword: 'short' });
    expect(component.passwordForm.invalid).toBe(true);
    await component.submitPassword();

    expect(accountSvc.changePassword).not.toHaveBeenCalled();
  });

  it('ne met jamais à jour AuthService.currentUser (rien dans AuthUser ne change)', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn().mockResolvedValue({ ok: true }),
    };
    const { fixture, currentUserSignal } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;
    const before = currentUserSignal();

    component.startPasswordEdit();
    component.passwordForm.setValue({
      currentPassword: 'oldpw',
      newPassword: 'newpassword123',
    });
    await component.submitPassword();

    expect(currentUserSignal()).toBe(before);
  });
});

describe('Account — changement d’adresse e-mail (crayon d’édition, revue de code)', () => {
  it('par défaut, l’adresse est en lecture seule avec un crayon, pas de champ visible', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance as any;

    expect(component.editingEmail()).toBe(false);
    expect(fixture.nativeElement.querySelector('input[formControlName="newEmail"]')).toBeNull();
  });

  it('startEmailEdit() révèle le mot de passe courant ET la nouvelle adresse ensemble', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance as any;

    component.startEmailEdit();
    fixture.detectChanges();

    expect(component.editingEmail()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('input[formControlName="currentPassword"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[formControlName="newEmail"]')).not.toBeNull();
  });

  it('startEmailEdit() pré-remplit newEmail avec l’adresse courante, en place plutôt qu’à ressaisir (revue de code)', async () => {
    const { fixture } = await createFixture(makeUser({ email: 'alice@example.com' }));
    const component = fixture.componentInstance as any;

    component.startEmailEdit();

    expect(component.emailForm.value.newEmail).toBe('alice@example.com');
  });

  it('cancelEmailEdit() réinitialise le formulaire et referme la section', async () => {
    const { fixture } = await createFixture();
    const component = fixture.componentInstance as any;

    component.startEmailEdit();
    component.emailForm.setValue({ currentPassword: 'a', newEmail: 'x@y.com' });
    component.cancelEmailEdit();

    expect(component.editingEmail()).toBe(false);
    expect(component.emailForm.value.newEmail).toBeFalsy();
  });

  it('soumission valide → AccountService.requestEmailChange appelé, formulaire réinitialisé, succès affiché, section repliée', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn(),
      requestEmailChange: vi.fn().mockResolvedValue({ ok: true }),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startEmailEdit();
    component.emailForm.setValue({
      currentPassword: 'oldpw',
      newEmail: 'new@example.com',
    });
    await component.submitEmailChange();

    expect(accountSvc.requestEmailChange).toHaveBeenCalledWith('oldpw', 'new@example.com');
    expect(component.emailForm.value.currentPassword).toBeFalsy();
    expect(component.emailForm.value.newEmail).toBeFalsy();
    expect(component.emailSaved()).toBe(true);
    expect(component.editingEmail()).toBe(false);
  });

  it('mot de passe courant incorrect (401) → message spécifique, formulaire non réinitialisé, section reste ouverte', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn(),
      requestEmailChange: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 401 })),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startEmailEdit();
    component.emailForm.setValue({
      currentPassword: 'wrongpw',
      newEmail: 'new@example.com',
    });
    await component.submitEmailChange();

    expect(component.emailError()).toBe('Mot de passe actuel incorrect.');
    expect(component.emailForm.value.currentPassword).toBe('wrongpw');
    expect(component.editingEmail()).toBe(true);
  });

  it('adresse déjà prise (409) → message dédié, pas le message générique (revue de code)', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn(),
      requestEmailChange: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409 })),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startEmailEdit();
    component.emailForm.setValue({
      currentPassword: 'oldpw',
      newEmail: 'new@example.com',
    });
    await component.submitEmailChange();

    expect(component.emailError()).toBe('Cette adresse est déjà utilisée par un autre compte.');
  });

  it('échec réseau/serveur (autre statut) → message générique', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn(),
      requestEmailChange: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 500 })),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startEmailEdit();
    component.emailForm.setValue({
      currentPassword: 'oldpw',
      newEmail: 'new@example.com',
    });
    await component.submitEmailChange();

    expect(component.emailError()).toBe('La demande a échoué. Réessayez.');
  });

  it('newEmail invalide → formulaire invalide, service jamais appelé', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn(),
      requestEmailChange: vi.fn(),
    };
    const { fixture } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;

    component.startEmailEdit();
    component.emailForm.setValue({ currentPassword: 'oldpw', newEmail: 'pas-un-email' });
    expect(component.emailForm.invalid).toBe(true);
    await component.submitEmailChange();

    expect(accountSvc.requestEmailChange).not.toHaveBeenCalled();
  });

  it('ne met jamais à jour AuthService.currentUser (l’adresse ne change qu’après confirmation, AC1/AC5)', async () => {
    const accountSvc = {
      updateDisplayName: vi.fn(),
      setTheme: vi.fn(),
      changePassword: vi.fn(),
      requestEmailChange: vi.fn().mockResolvedValue({ ok: true }),
    };
    const { fixture, currentUserSignal } = await createFixture(makeUser(), accountSvc);
    const component = fixture.componentInstance as any;
    const before = currentUserSignal();

    component.startEmailEdit();
    component.emailForm.setValue({
      currentPassword: 'oldpw',
      newEmail: 'new@example.com',
    });
    await component.submitEmailChange();

    expect(currentUserSignal()).toBe(before);
  });
});

describe('Account — déconnexion (Story 29.3, foyer déplacé depuis le menu du Shell)', () => {
  it('un bouton de déconnexion est rendu', async () => {
    const { fixture } = await createFixture();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(buttons.some((b) => b.textContent?.includes('Fermer le grimoire'))).toBe(true);
  });

  it('clic sur le bouton de déconnexion appelle AuthService.logout() puis navigue vers /login', async () => {
    const { fixture, authSvc } = await createFixture();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const logoutButton = buttons.find((b) => b.textContent?.includes('Fermer le grimoire'));
    logoutButton!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(authSvc.logout).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });
});

describe('Account — bandeau contextuel (Story 29.4)', () => {
  it("ngOnInit() renseigne ContextualNavService avec le titre de l'écran", async () => {
    await createFixture();

    const contextualNav = TestBed.inject(ContextualNavService);
    expect(contextualNav.title()).toBe('Mon grimoire personnel');
  });
});
