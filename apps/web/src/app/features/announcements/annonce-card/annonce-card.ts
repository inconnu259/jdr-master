import { Component, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { AnnouncementDto } from '@master-jdr/shared';
import { IdentityLabel } from '../../../shared/identity/identity-label';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

@Component({
  selector: 'app-annonce-card',
  standalone: true,
  imports: [DatePipe, IdentityLabel],
  templateUrl: './annonce-card.html',
  styleUrl: './annonce-card.scss',
})
export class AnnonceCard {
  protected readonly theme = inject(ThemeToneService);

  readonly announcement = input.required<AnnouncementDto>();
  // Story 9.2 : composant purement présentationnel — c'est l'appelant qui détermine le libellé de
  // portée (règles différentes selon le contexte : kind de la Partie pour une annonce campagne-wide,
  // libellé générique pour une annonce scopée à un scénario) et le passe déjà résolu ici.
  readonly scopeLabel = input.required<string>();
}
