import { Component, DestroyRef, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { InvitationDto } from '@master-jdr/shared';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService, userTopic } from '../../core/realtime/realtime.service';
import { gameSystemName, partieKindLabel } from '../../core/parties/parties.util';
import { ContextualNavService } from '../../core/navigation/contextual-nav.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly myPartiesSvc = inject(MyPartiesService);
  private readonly invitations = inject(InvitationsService);
  private readonly openPollsSvc = inject(OpenPollsService);
  protected readonly theme = inject(ThemeToneService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly contextualNav = inject(ContextualNavService);

  protected readonly allParties = this.myPartiesSvc.allParties;
  protected readonly hasMjParties = this.myPartiesSvc.hasMjParties;
  protected readonly received = signal<InvitationDto[]>([]);
  protected readonly openPolls = this.openPollsSvc.openPolls;
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  constructor() {
    // Story 21.1 (AC2) : réagit au signal générique InvitationsService.changed (RealtimeService).
    // PIÈGE (même classe que Story 20.1/20.2, mais SANS le piège de timing associé) : Dashboard a
    // DÉJÀ un chargement dédié dans ngOnInit(). La première exécution d'un effect() a lieu à la
    // CONSTRUCTION du composant — un garde firstRun neutralise cette première exécution pour
    // éviter un refetch redondant avec celui que ngOnInit() fait juste après.
    let firstRun = true;
    effect(() => {
      this.invitations.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => void this.loadInvitations());
    });
  }

  async ngOnInit(): Promise<void> {
    this.contextualNav.set({ title: this.theme.tone()['nav.my_games'] });
    const id = this.auth.currentUser()?.id;
    if (id) {
      this.realtime.connect(userTopic(id));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(userTopic(id)));
    }
    await this.loadInvitations();
  }

  async accept(inv: InvitationDto): Promise<void> {
    await this.invitations.accept(inv.id);
    this.received.update((list) => list.filter((i) => i.id !== inv.id));
    await this.myPartiesSvc.refreshPlayerParties();
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
