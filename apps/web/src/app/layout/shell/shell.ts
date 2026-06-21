import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { AuthService } from '../../core/auth/auth.service';

type Mode = 'joueur' | 'mj';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatButtonToggleModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <span class="logo">master-jdr</span>
      <span class="spacer"></span>

      <!-- Bascule de mode (en 1a : simple toggle visuel ; la logique "suis-je MJ" arrive en 1b). -->
      <mat-button-toggle-group
        [value]="mode()"
        (change)="mode.set($event.value)"
        hideSingleSelectionIndicator
        aria-label="Mode"
      >
        <mat-button-toggle value="joueur">Joueur</mat-button-toggle>
        <mat-button-toggle value="mj">MJ</mat-button-toggle>
      </mat-button-toggle-group>

      <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Menu utilisateur">
        <mat-icon>account_circle</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        <div class="menu-user">{{ user()?.pseudo }}</div>
        <button mat-menu-item (click)="logout()">
          <mat-icon>logout</mat-icon>
          <span>Déconnexion</span>
        </button>
      </mat-menu>
    </mat-toolbar>

    <main class="content">
      <router-outlet />
    </main>
  `,
  styles: `
    .logo { font-weight: 700; }
    .spacer { flex: 1 1 auto; }
    mat-button-toggle-group { margin-right: 0.5rem; }
    .menu-user { padding: 0.5rem 1rem; font-weight: 600; opacity: 0.7; }
    .content { padding: 1.5rem; max-width: 60rem; margin: 0 auto; }
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.currentUser;
  protected readonly mode = signal<Mode>('joueur');

  async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
