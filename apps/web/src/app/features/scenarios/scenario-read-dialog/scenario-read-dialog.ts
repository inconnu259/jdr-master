import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import type { CharacterDto, PartieKind, ScenarioDto } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ScenarioStatusBadge } from '../scenario-status-badge/scenario-status-badge';
import { CharacterSummaryCard } from '../../characters/character-summary-card/character-summary-card';
import { SeanceList } from '../seance-list/seance-list';

export interface ScenarioReadDialogData {
  scenario: ScenarioDto;
  partieKind: PartieKind;
  characters: CharacterDto[];
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse && typeof err.error?.message === 'string') {
    return err.error.message;
  }
  return fallback;
}

/**
 * Fiche scénario joueur, strictement en lecture seule — jamais de FieldEditPencil/upload, quel que
 * soit le statut ou le rôle du viewer (contrainte plus stricte que ScenarioEditor, MJ-only, Story
 * 7.4, qui reste inchangé). Rendu conditionnel anti-spoil (AD-6) : A_VENIR n'affiche que le titre.
 */
@Component({
  selector: 'app-scenario-read-dialog',
  imports: [MatDialogModule, MatButtonModule, ScenarioStatusBadge, CharacterSummaryCard, SeanceList],
  templateUrl: './scenario-read-dialog.html',
  styleUrl: './scenario-read-dialog.scss',
})
export class ScenarioReadDialog implements OnInit {
  private readonly data = inject<ScenarioReadDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<ScenarioReadDialog, void>>(MatDialogRef);
  private readonly scenarios = inject(ScenariosService);
  private readonly auth = inject(AuthService);
  protected readonly currentUserId = computed(() => this.auth.currentUser()?.id);

  protected readonly scenario = signal<ScenarioDto>(this.data.scenario);
  // Garde défensive : BROUILLON ne devrait jamais atteindre ce dialogue (ScenarioTimeline le filtre
  // toujours en amont), mais si un futur appelant l'ouvrait quand même, il reste protégé comme
  // A_VENIR (titre seul) plutôt que de tomber dans la branche complète par défaut.
  protected readonly isRestricted = computed(() => {
    const status = this.scenario().status;
    return status === 'A_VENIR' || status === 'BROUILLON';
  });
  protected readonly isPasse = computed(() => this.scenario().status === 'PASSE');

  protected readonly isEpisodique = computed(() => this.data.partieKind === 'CAMPAGNE_EPISODIQUE');
  protected readonly isParticipating = computed(() =>
    (this.scenario().participants ?? []).some((p) => p.userId === this.currentUserId()),
  );
  protected readonly participantCharacters = computed(() => {
    const ids = new Set((this.scenario().participants ?? []).map((p) => p.userId));
    return this.data.characters.filter((c) => ids.has(c.userId));
  });
  // Un participant peut rejoindre une enquête avant d'avoir créé son personnage sur cette Partie —
  // sans ce fallback, cliquer « Participer » ne montre alors aucune confirmation visuelle (ni carte,
  // ni texte), ce qui donne l'impression que l'action n'a pas fonctionné.
  protected readonly participantsWithoutCharacter = computed(() => {
    const characterUserIds = new Set(this.data.characters.map((c) => c.userId));
    return (this.scenario().participants ?? []).filter((p) => !characterUserIds.has(p.userId));
  });
  protected readonly participantError = signal<string | null>(null);

  // Le scénario reçu via MAT_DIALOG_DATA peut être un instantané mis en cache par l'appelant (ex.
  // ScenarioTimeline chargée avant qu'un vote lié à une séance ait été tranché via le calendrier, en
  // dehors de ce dialogue) — on recharge une version fraîche à l'ouverture plutôt que de faire
  // confiance à l'instantané pour la durée de vie du dialogue.
  async ngOnInit(): Promise<void> {
    try {
      const fresh = (await this.scenarios.listAll(this.data.scenario.partieId)).find(
        (s) => s.id === this.data.scenario.id,
      );
      if (fresh) this.scenario.set(fresh);
    } catch {
      // Le scénario reçu en donnée de dialogue reste affiché tel quel si le rafraîchissement échoue.
    }
  }

  protected async participate(): Promise<void> {
    this.participantError.set(null);
    try {
      this.scenario.set(await this.scenarios.participate(this.scenario().id));
    } catch (err) {
      this.participantError.set(extractErrorMessage(err, 'Impossible de participer à ce scénario.'));
    }
  }

  protected onSeanceLinked(updated: ScenarioDto): void {
    this.scenario.set(updated);
  }

  protected close(): void {
    this.dialogRef.close();
  }
}
