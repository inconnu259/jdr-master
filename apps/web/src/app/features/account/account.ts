import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { ThemeSelector } from './theme-selector/theme-selector';
import { FieldEditPencil } from '../characters/character-sheet/field-edit-pencil/field-edit-pencil';

const DISPLAY_NAME_MAX_LENGTH = 60;

@Component({
  selector: 'app-account',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ThemeSelector,
    FieldEditPencil,
  ],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);

  protected readonly theme = inject(ThemeToneService);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  // Page « sobre » (revue de code, demande utilisateur) : nom affiché et e-mail se lisent comme
  // le pseudo (lecture seule) avec un crayon d'édition à côté — le clic ouvre le champ inline. Le
  // mot de passe n'affiche aucun champ par défaut, juste un bouton qui révèle le formulaire.
  protected readonly editingPassword = signal(false);
  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });
  protected readonly passwordSaving = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly passwordSaved = signal(false);

  protected readonly editingEmail = signal(false);
  protected readonly emailForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newEmail: ['', [Validators.required, Validators.email]],
  });
  protected readonly emailSaving = signal(false);
  protected readonly emailError = signal<string | null>(null);
  protected readonly emailSaved = signal(false);

  protected get pseudo(): string {
    return this.auth.currentUser()?.pseudo ?? '';
  }

  protected get email(): string {
    return this.auth.currentUser()?.email ?? '';
  }

  protected get displayName(): string {
    return this.auth.currentUser()?.displayName ?? '';
  }

  async onDisplayNameConfirm(value: string | number): Promise<void> {
    const displayName = String(value).trim();
    this.error.set(null);
    this.saved.set(false);
    // FieldEditPencil ne porte pas de validation propre (juste un garde NaN pour les nombres) —
    // les règles précédemment portées par le FormGroup (requis, non-vide, ≤60) sont revalidées ici.
    if (!displayName || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      this.error.set(this.theme.tone()['account.error']);
      return;
    }
    this.saving.set(true);
    try {
      const user = await this.account.updateDisplayName(displayName);
      this.auth.currentUser.set(user);
      this.saved.set(true);
    } catch {
      this.error.set(this.theme.tone()['account.error']);
    } finally {
      this.saving.set(false);
    }
  }

  protected startPasswordEdit(): void {
    this.editingPassword.set(true);
    this.passwordError.set(null);
    this.passwordSaved.set(false);
  }

  protected cancelPasswordEdit(): void {
    this.editingPassword.set(false);
    this.passwordForm.reset();
    this.passwordError.set(null);
  }

  async submitPassword(): Promise<void> {
    if (this.passwordForm.invalid) return;
    this.passwordSaving.set(true);
    this.passwordError.set(null);
    this.passwordSaved.set(false);
    try {
      const { currentPassword, newPassword } = this.passwordForm.getRawValue();
      await this.account.changePassword(currentPassword, newPassword);
      this.passwordForm.reset();
      this.passwordSaved.set(true);
      this.editingPassword.set(false);
    } catch (err) {
      this.passwordError.set(
        err instanceof HttpErrorResponse && err.status === 401
          ? this.theme.tone()['account.password_wrong_current']
          : this.theme.tone()['account.password_error'],
      );
    } finally {
      this.passwordSaving.set(false);
    }
  }

  protected startEmailEdit(): void {
    // Pré-rempli avec l'adresse courante (déjà visible juste avant le clic) plutôt que de laisser
    // un champ vide à ressaisir intégralement — l'utilisateur édite en place (revue de code).
    this.emailForm.patchValue({ newEmail: this.email });
    this.editingEmail.set(true);
    this.emailError.set(null);
    this.emailSaved.set(false);
  }

  protected cancelEmailEdit(): void {
    this.editingEmail.set(false);
    this.emailForm.reset();
    this.emailError.set(null);
  }

  /**
   * Ne met jamais à jour `this.auth.currentUser` (AC1/AC5, Story 28.6) : l'adresse du compte ne
   * change qu'une fois le lien de confirmation activé, jamais ici.
   */
  async submitEmailChange(): Promise<void> {
    if (this.emailForm.invalid) return;
    this.emailSaving.set(true);
    this.emailError.set(null);
    this.emailSaved.set(false);
    try {
      const { currentPassword, newEmail } = this.emailForm.getRawValue();
      await this.account.requestEmailChange(currentPassword, newEmail);
      this.emailForm.reset();
      this.emailSaved.set(true);
      this.editingEmail.set(false);
    } catch (err) {
      this.emailError.set(
        this.emailErrorMessage(err instanceof HttpErrorResponse ? err.status : null),
      );
    } finally {
      this.emailSaving.set(false);
    }
  }

  // 401 (mot de passe incorrect) et 409 (adresse déjà prise) appellent chacun un message dédié —
  // retenter à l'identique après un 409 échouera toujours, un message générique serait trompeur
  // (revue de code).
  private emailErrorMessage(status: number | null): string {
    if (status === 401) return this.theme.tone()['account.email_change_wrong_current'];
    if (status === 409) return this.theme.tone()['account.email_change_taken'];
    return this.theme.tone()['account.email_change_error'];
  }
}
