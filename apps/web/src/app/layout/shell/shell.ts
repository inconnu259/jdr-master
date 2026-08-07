import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDivider } from '@angular/material/divider';
import { AuthService } from '../../core/auth/auth.service';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    MatDivider,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly myPartiesSvc = inject(MyPartiesService);
  private readonly openPollsSvc = inject(OpenPollsService);
  private readonly router = inject(Router);
  // Injecter pour déclencher l'initialisation du thème (apply CSS class + localStorage) dès le Shell.
  protected readonly theme = inject(ThemeToneService);

  protected readonly user = this.auth.currentUser;
  protected readonly openPollsCount = this.openPollsSvc.count;

  // Charge les parties (alimente la liste unifiée du dashboard, Story 29.1).
  ngOnInit(): void {
    void this.myPartiesSvc.refreshMjParties();
    void this.myPartiesSvc.refreshPlayerParties();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
