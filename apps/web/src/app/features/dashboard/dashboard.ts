import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { InvitationDto, SessionPollDto } from '@master-jdr/shared';
import { ModeService } from '../../core/mode/mode.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { PollService } from '../../core/poll/poll.service';
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
  private readonly pollSvc = inject(PollService);
  protected readonly theme = inject(ThemeToneService);

  protected readonly mode = this.modeSvc.mode;
  protected readonly parties = this.modeSvc.mjParties;
  protected readonly playerParties = this.modeSvc.playerParties;
  protected readonly received = signal<InvitationDto[]>([]);
  protected readonly openPolls = signal<Map<string, SessionPollDto>>(new Map());
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  private loadOpenPollsSeq = 0;

  constructor() {
    effect(() => {
      const parties = this.playerParties();
      if (parties.length > 0) void this.loadOpenPolls();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadInvitations();
  }

  private async loadOpenPolls(): Promise<void> {
    const parties = this.playerParties();
    if (parties.length === 0) return;
    const seq = ++this.loadOpenPollsSeq;
    const results = await Promise.allSettled(
      parties.map(p =>
        this.pollSvc.getCurrentPoll(p.id).then(poll => ({ id: p.id, poll })),
      ),
    );
    // Une exécution plus récente de loadOpenPolls() a démarré entre-temps (effect() re-déclenché
    // par une nouvelle valeur de playerParties()) — ignorer ce résultat obsolète pour ne pas
    // écraser un état plus récent.
    if (seq !== this.loadOpenPollsSeq) return;
    const map = new Map<string, SessionPollDto>();
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.poll) {
        map.set(r.value.id, r.value.poll);
      }
    }
    this.openPolls.set(map);
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
