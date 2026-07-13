import { Component, computed, inject } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioStatusBadge } from '../scenario-status-badge/scenario-status-badge';

export interface ScenarioReadDialogData {
  scenario: ScenarioDto;
}

/**
 * Fiche scénario joueur, strictement en lecture seule — jamais de FieldEditPencil/upload, quel que
 * soit le statut ou le rôle du viewer (contrainte plus stricte que ScenarioEditor, MJ-only, Story
 * 7.4, qui reste inchangé). Rendu conditionnel anti-spoil (AD-6) : A_VENIR n'affiche que le titre.
 */
@Component({
  selector: 'app-scenario-read-dialog',
  imports: [MatDialogModule, MatButtonModule, ScenarioStatusBadge],
  templateUrl: './scenario-read-dialog.html',
  styleUrl: './scenario-read-dialog.scss',
})
export class ScenarioReadDialog {
  private readonly data = inject<ScenarioReadDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<ScenarioReadDialog, void>>(MatDialogRef);

  protected readonly scenario = computed(() => this.data.scenario);
  // Garde défensive : BROUILLON ne devrait jamais atteindre ce dialogue (ScenarioTimeline le filtre
  // toujours en amont), mais si un futur appelant l'ouvrait quand même, il reste protégé comme
  // A_VENIR (titre seul) plutôt que de tomber dans la branche complète par défaut.
  protected readonly isRestricted = computed(() => {
    const status = this.scenario().status;
    return status === 'A_VENIR' || status === 'BROUILLON';
  });
  protected readonly isPasse = computed(() => this.scenario().status === 'PASSE');

  protected close(): void {
    this.dialogRef.close();
  }
}
