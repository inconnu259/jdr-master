import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  template: `
    <h1>Tableau de bord</h1>
    <p>Bienvenue, <strong>{{ user()?.pseudo }}</strong> 👋</p>
    <p class="hint">Palier 1a — l'auth et le shell sont en place. Les parties arrivent au Palier 1b.</p>
  `,
  styles: `
    .hint { color: var(--mat-sys-on-surface-variant, #666); }
  `,
})
export class Dashboard {
  protected readonly user = inject(AuthService).currentUser;
}
