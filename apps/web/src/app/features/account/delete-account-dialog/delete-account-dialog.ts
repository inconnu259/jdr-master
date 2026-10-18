import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { AccountDeletionImpactDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { fillTone } from '../../../core/theme/tone-format';
import { PasswordReveal } from '../../../shared/password-reveal/password-reveal';
import { PasswordToggle } from '../../../shared/password-reveal/password-toggle';

export interface DeleteAccountDialogData {
  pseudo: string;
  impact: AccountDeletionImpactDto;
}

/**
 * Story 43.1 (UX-DR12, confirmation n° 1) — « Effacer votre compte ? » : ce qui disparaîtrait avec
 * lui, le champ du mot de passe et le bouton rouge. Les listes vides sont omises.
 *
 * Le bouton rouge reste inerte dans cette story : l'effacement lui-même (`DELETE /me`) est la
 * Story 43.2, qui l'activera et enverra le mot de passe. « Renoncer » ne change rien.
 */
@Component({
  selector: 'app-delete-account-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PasswordReveal,
    PasswordToggle,
  ],
  template: `
    <h2 mat-dialog-title>{{ tone()['parties.confirm_title'] }}</h2>
    <mat-dialog-content>
      <p class="intro">{{ intro }}</p>

      @if (data.impact.groups.length > 0) {
        <section class="impact-list" data-testid="impact-groups">
          <h3>{{ tone()['account.delete_groups_title'] }}</h3>
          <ul>
            @for (g of data.impact.groups; track g.id) {
              <li>{{ groupLine(g) }}</li>
            }
          </ul>
        </section>
      }

      @if (data.impact.jdrParties.length > 0) {
        <section class="impact-list" data-testid="impact-jdr">
          <h3>{{ tone()['account.delete_jdr_title'] }}</h3>
          <ul>
            @for (p of data.impact.jdrParties; track p.id) {
              <li>{{ jdrLine(p) }}</li>
            }
          </ul>
        </section>
      }

      <p class="irreversible">{{ tone()['account.delete_irreversible'] }}</p>

      <mat-form-field appearance="outline">
        <mat-label>{{ tone()['account.current_password_label'] }}</mat-label>
        <input
          matInput
          type="password"
          autocomplete="current-password"
          [formControl]="password"
          appPasswordReveal
          #pw="appPasswordReveal"
        />
        <app-password-toggle matSuffix [for]="pw" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">{{ tone()['common.annuler'] }}</button>
      <button mat-flat-button class="confirm-destructive" disabled>
        <mat-icon aria-hidden="true">warning</mat-icon>
        {{ tone()['account.delete_confirm_btn'] }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .intro,
    .irreversible {
      margin: 0 0 0.75rem;
    }
    .impact-list {
      margin: 0 0 0.75rem;
    }
    .impact-list h3 {
      margin: 0 0 0.25rem;
      font-size: 0.95rem;
      font-weight: 600;
    }
    .impact-list ul {
      margin: 0;
      padding-left: 1.25rem;
    }
    mat-form-field {
      width: 100%;
    }
    .confirm-destructive {
      --mat-button-filled-container-color: var(--color-unavailable);
      --mat-button-filled-label-text-color: #fff;
      --mat-button-filled-hover-state-layer-color: #fff;
      --mat-button-filled-ripple-color: #fff;
      font-weight: 600;
    }
  `,
})
export class DeleteAccountDialog {
  protected readonly data = inject<DeleteAccountDialogData>(MAT_DIALOG_DATA);
  private readonly theme = inject(ThemeToneService);
  protected readonly tone = this.theme.tone;
  protected readonly password = new FormControl('', { nonNullable: true });

  protected get intro(): string {
    return fillTone(this.tone()['account.delete_intro'], { pseudo: this.data.pseudo });
  }

  /** « 1 membre » / « 3 membres » : un seul au singulier, 0 compris (français). */
  private plural(base: string, n: number): string {
    const tone = this.tone();
    return fillTone(tone[`${base}_${n > 1 ? 'many' : 'one'}`], { n });
  }

  protected groupLine(g: AccountDeletionImpactDto['groups'][number]): string {
    return fillTone(this.tone()['account.delete_group_line'], {
      name: g.name,
      members: this.plural('account.delete_members', g.memberCount),
      events: this.plural('account.delete_events', g.eventCount),
    });
  }

  protected jdrLine(p: AccountDeletionImpactDto['jdrParties'][number]): string {
    const tone = this.tone();
    if (p.playerCount === 0) return fillTone(tone['account.delete_jdr_line_none'], { name: p.name });
    const key = p.playerCount === 1 ? 'account.delete_jdr_line_one' : 'account.delete_jdr_line';
    return fillTone(tone[key], { name: p.name, n: p.playerCount });
  }
}
