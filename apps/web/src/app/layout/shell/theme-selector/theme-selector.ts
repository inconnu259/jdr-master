import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import type { Theme } from '../../../core/theme/tones';

@Component({
  selector: 'app-theme-selector',
  imports: [MatIconModule],
  templateUrl: './theme-selector.html',
  styleUrl: './theme-selector.scss',
})
export class ThemeSelector {
  protected readonly themeSvc = inject(ThemeToneService);

  protected readonly gradients: Record<Theme, string> = {
    'grimoire-emeraude': 'linear-gradient(135deg, #1a0a30 20%, #9b6dff)',
    'foret-ancienne': 'linear-gradient(135deg, #080f0a 25%, #2ecc71)',
    'medieval-steampunk': 'linear-gradient(135deg, #1a1008 25%, #cd7f32)',
  };

  protected readonly accents: Record<Theme, string> = {
    'grimoire-emeraude': '#9b6dff',
    'foret-ancienne': '#2ecc71',
    'medieval-steampunk': '#cd7f32',
  };

  protected selectTheme(theme: Theme): void {
    this.themeSvc.setTheme(theme);
  }
}
