import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import type { InviteLinkPreviewDto } from '@master-jdr/shared';
import { AuthService } from '../../core/auth/auth.service';
import { JoinService } from '../../core/join/join.service';
import { ModeService } from '../../core/mode/mode.service';
import { gameSystemName } from '../../core/parties/parties.util';

@Component({
  selector: 'app-join',
  imports: [RouterLink, MatCardModule, MatButtonModule],
  templateUrl: './join.html',
  styleUrl: './join.scss',
})
export class Join implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly joinSvc = inject(JoinService);
  private readonly modeSvc = inject(ModeService);

  protected readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  protected readonly preview = signal<InviteLinkPreviewDto | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loggedIn = this.auth.currentUser;
  protected readonly system = gameSystemName;

  async ngOnInit(): Promise<void> {
    await this.auth.loadSession();
    try {
      this.preview.set(await this.joinSvc.preview(this.token));
    } catch {
      this.notFound.set(true);
    }
  }

  async join(): Promise<void> {
    this.error.set(null);
    try {
      const { partieId } = await this.joinSvc.join(this.token);
      await this.modeSvc.refreshPlayerParties();
      void this.router.navigate(['/parties', partieId]);
    } catch {
      this.error.set('Impossible de rejoindre (lien invalide, expiré, ou déjà membre).');
    }
  }
}
