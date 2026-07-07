import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Le lien reçu par e-mail porte le token dans le chemin : /reset-password/:token. Lu de façon
   * réactive (pas via `snapshot`) au cas où Angular réutiliserait l'instance du composant lors
   * d'une navigation ne changeant que ce paramètre (deux liens de reset ouverts successivement).
   */
  protected readonly token = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('token') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('token') ?? '' },
  );
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    const token = this.token();
    if (this.form.invalid || !token) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const { newPassword } = this.form.getRawValue();
      await this.auth.resetPassword(token, newPassword);
      void this.router.navigate(['/login']);
    } catch {
      this.error.set('Lien invalide ou expiré. Merci de refaire une demande.');
    } finally {
      this.loading.set(false);
    }
  }
}
