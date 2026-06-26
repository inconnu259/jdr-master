import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Inscription sur invitation : le token vient du lien (/join → /register?token=…). */
  protected readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    pseudo: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || !this.token) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, pseudo, password } = this.form.getRawValue();
      await this.auth.register(email, pseudo, password, this.token);
      await this.auth.login(email, password);
      void this.router.navigate(['/']);
    } catch {
      this.error.set('Impossible de créer le compte (lien invalide, ou email/pseudo déjà pris ?).');
    } finally {
      this.loading.set(false);
    }
  }
}
