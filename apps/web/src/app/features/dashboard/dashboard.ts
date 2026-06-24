import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ModeService } from '../../core/mode/mode.service';
import { gameSystemName, partieKindLabel } from '../../core/parties/parties.util';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly modeSvc = inject(ModeService);
  protected readonly mode = this.modeSvc.mode;
  protected readonly parties = this.modeSvc.mjParties;
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;
}
