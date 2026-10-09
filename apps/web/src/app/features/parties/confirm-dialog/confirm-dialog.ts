import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

export interface ConfirmData {
  message: string;
  confirmLabel?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ theme.tone()['parties.confirm_title'] }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">{{ theme.tone()['common.annuler'] }}</button>
      <button mat-flat-button [mat-dialog-close]="true">
        {{ data.confirmLabel ?? theme.tone()['common.supprimer'] }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  protected readonly theme = inject(ThemeToneService);
}
