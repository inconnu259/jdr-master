import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { PartieDto } from '@master-jdr/shared';
import { PartiesService } from '../../../core/parties/parties.service';
import { ModeService } from '../../../core/mode/mode.service';
import { gameSystemName, partieKindLabel } from '../../../core/parties/parties.util';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-partie-detail',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './partie-detail.html',
  styleUrl: './partie-detail.scss',
})
export class PartieDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parties = inject(PartiesService);
  private readonly modeSvc = inject(ModeService);
  private readonly dialog = inject(MatDialog);

  protected readonly partie = signal<PartieDto | null>(null);
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.partie.set(await this.parties.get(id));
  }

  async confirmDelete(p: PartieDto): Promise<void> {
    const ref = this.dialog.open(ConfirmDialog, {
      data: { message: `Supprimer « ${p.name} » ? Cette action est irréversible.` },
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) return;
    await this.parties.remove(p.id);
    await this.modeSvc.refreshMjParties();
    void this.router.navigate(['/']);
  }
}
