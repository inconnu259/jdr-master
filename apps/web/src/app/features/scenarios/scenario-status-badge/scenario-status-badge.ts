import { Component, computed, input } from '@angular/core';
import type { ScenarioStatus } from '@master-jdr/shared';

interface StatusPresentation {
  label: string;
  cssClass: string;
}

// Microcopy joueur : COURANT s'affiche "En cours", jamais littéralement "Courant" (nom technique
// du statut, cf. EXPERIENCE.md §3). Aucune nouvelle couleur — classes CSS mappées aux tokens
// existants dans scenario-status-badge.scss (--jdr-accent-1/--color-unknown/--jdr-text-muted).
const PRESENTATION: Record<ScenarioStatus, StatusPresentation> = {
  BROUILLON: { label: 'Brouillon', cssClass: 'status-brouillon' },
  A_VENIR: { label: 'À venir', cssClass: 'status-a-venir' },
  COURANT: { label: 'En cours', cssClass: 'status-courant' },
  PASSE: { label: 'Passé', cssClass: 'status-passe' },
};

@Component({
  selector: 'app-scenario-status-badge',
  templateUrl: './scenario-status-badge.html',
  styleUrl: './scenario-status-badge.scss',
})
export class ScenarioStatusBadge {
  readonly status = input.required<ScenarioStatus>();

  protected readonly presentation = computed(() => PRESENTATION[this.status()]);
}
