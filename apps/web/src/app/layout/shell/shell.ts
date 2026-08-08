import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatIconModule,
    MatBadgeModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private readonly myPartiesSvc = inject(MyPartiesService);
  private readonly openPollsSvc = inject(OpenPollsService);
  // Injecter pour déclencher l'initialisation du thème (apply CSS class + localStorage) dès le Shell.
  protected readonly theme = inject(ThemeToneService);

  protected readonly openPollsCount = this.openPollsSvc.count;

  // Charge les parties (alimente la liste unifiée du dashboard, Story 29.1).
  ngOnInit(): void {
    void this.myPartiesSvc.refreshMjParties();
    void this.myPartiesSvc.refreshPlayerParties();
  }
}
