import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-rollback-email-change',
  imports: [RouterLink, MatCardModule, MatButtonModule],
  templateUrl: './rollback-email-change.html',
  styleUrl: './rollback-email-change.scss',
})
export class RollbackEmailChange {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly token = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('token') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('token') ?? '' },
  );
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly restored = signal(false);

  async rollback(): Promise<void> {
    const token = this.token();
    if (!token) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.rollbackEmailChange(token);
      // Accusé de réception affiché avant la redirection (revue de code, patron ConfirmEmailChange)
      // — l'utilisateur doit voir que le rollback a bien eu lieu avant d'être envoyé ailleurs.
      this.restored.set(true);
    } catch {
      this.error.set('Lien invalide ou expiré.');
    } finally {
      this.loading.set(false);
    }
  }

  continueToPasswordReset(): void {
    // mustResetPassword bloquera toute connexion directe (AC3) — /forgot-password plutôt que
    // /login, cohérent avec l'action que l'utilisateur doit accomplir ensuite.
    void this.router.navigate(['/forgot-password']);
  }
}
