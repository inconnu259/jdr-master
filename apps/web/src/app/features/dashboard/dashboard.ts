import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { InvitationDto } from '@master-jdr/shared';
import { ModeService } from '../../core/mode/mode.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { gameSystemName, partieKindLabel } from '../../core/parties/parties.util';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly modeSvc = inject(ModeService);
  private readonly invitations = inject(InvitationsService);
  protected readonly theme = inject(ThemeToneService);

  protected readonly mode = this.modeSvc.mode;
  protected readonly parties = this.modeSvc.mjParties;
  protected readonly playerParties = this.modeSvc.playerParties;
  protected readonly received = signal<InvitationDto[]>([]);
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  async ngOnInit(): Promise<void> {
    await this.loadInvitations();
  }

  async accept(inv: InvitationDto): Promise<void> {
    await this.invitations.accept(inv.id);
    this.received.update((list) => list.filter((i) => i.id !== inv.id));
    await this.modeSvc.refreshPlayerParties();
  }

  async decline(inv: InvitationDto): Promise<void> {
    await this.invitations.decline(inv.id);
    this.received.update((list) => list.filter((i) => i.id !== inv.id));
  }

  private async loadInvitations(): Promise<void> {
    try {
      this.received.set(await this.invitations.listReceived());
    } catch {
      this.received.set([]);
    }
  }
}
