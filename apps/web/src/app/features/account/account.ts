import { Component, OnInit, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';

function notBlank(control: { value: string }): ValidationErrors | null {
  return control.value.trim().length > 0 ? null : { blank: true };
}

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);

  protected readonly theme = inject(ThemeToneService);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(60), notBlank]],
  });

  protected get pseudo(): string {
    return this.auth.currentUser()?.pseudo ?? '';
  }

  protected get email(): string {
    return this.auth.currentUser()?.email ?? '';
  }

  ngOnInit(): void {
    this.form.patchValue({
      displayName: this.auth.currentUser()?.displayName ?? '',
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const displayName = this.form.getRawValue().displayName.trim();
      const user = await this.account.updateDisplayName(displayName);
      this.auth.currentUser.set(user);
      this.saved.set(true);
    } catch {
      this.error.set(this.theme.tone()['account.error']);
    } finally {
      this.saving.set(false);
    }
  }
}
