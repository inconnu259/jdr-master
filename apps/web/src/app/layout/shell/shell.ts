import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { AuthService } from '../../core/auth/auth.service';
import { ModeService } from '../../core/mode/mode.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatButtonToggleModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly modeSvc = inject(ModeService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.currentUser;
  protected readonly mode = this.modeSvc.mode;
  protected readonly hasMjParties = this.modeSvc.hasMjParties;

  // Charge les parties (MJ pilote le toggle + dashboard MJ ; joueur alimente le dashboard Joueur).
  ngOnInit(): void {
    void this.modeSvc.refreshMjParties();
    void this.modeSvc.refreshPlayerParties();
  }

  setMode(m: 'joueur' | 'mj'): void {
    this.modeSvc.setMode(m);
    void this.router.navigate(['/']); // repasser réellement sur le tableau de bord du mode choisi
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
