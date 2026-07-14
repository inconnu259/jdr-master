import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import type { CharacterDto, CharacterNoteDto, PartieKind, ScenarioDto } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { CharacterService } from '../../../core/characters/character.service';
import { ScenarioStatusBadge } from '../scenario-status-badge/scenario-status-badge';
import { CharacterSummaryCard } from '../../characters/character-summary-card/character-summary-card';
import { SeanceList } from '../seance-list/seance-list';

export interface ScenarioReadDialogData {
  scenario: ScenarioDto;
  partieKind: PartieKind;
  characters: CharacterDto[];
  /**
   * Le viewer courant est le MJ de la Partie (Story 8.5) — seul cas où ce dialogue, normalement
   * strictement lecture seule, expose un CTA de navigation vers ScenarioEditor pour rédiger le
   * résumé de fin. Optionnel (défaut `false`) : seul `ScenarioTimeline` le renseigne aujourd'hui.
   */
  isMj?: boolean;
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
  imports: [
    MatDialogModule,
    MatButtonModule,
    ScenarioStatusBadge,
    CharacterSummaryCard,
    SeanceList,
  ],
  templateUrl: './scenario-read-dialog.html',
  styleUrl: './scenario-read-dialog.scss',
})
export class ScenarioReadDialog implements OnInit {
  private readonly data = inject<ScenarioReadDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<ScenarioReadDialog, void>>(MatDialogRef);
  private readonly scenarios = inject(ScenariosService);
  private readonly characterSvc = inject(CharacterService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly currentUserId = computed(() => this.auth.currentUser()?.id);
  protected readonly isMj = computed(() => this.data.isMj ?? false);

  protected readonly scenario = signal<ScenarioDto>(this.data.scenario);
  // Copie locale mutable de data.characters (Story 8.6) — mise à jour après
  // setJournalAutoAssociate() pour que le switch reflète le nouveau réglage sans rechargement.
  protected readonly characters = signal<CharacterDto[]>(this.data.characters);
  protected readonly ownCharacter = computed(() =>
    this.characters().find((c) => c.userId === this.currentUserId()),
  );
  protected readonly ownNotes = signal<CharacterNoteDto[]>([]);
  protected readonly journalError = signal<string | null>(null);
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
    return this.characters().filter((c) => ids.has(c.userId));
  });
  // Un participant peut rejoindre une enquête avant d'avoir créé son personnage sur cette Partie —
  // sans ce fallback, cliquer « Participer » ne montre alors aucune confirmation visuelle (ni carte,
  // ni texte), ce qui donne l'impression que l'action n'a pas fonctionné.
  protected readonly participantsWithoutCharacter = computed(() => {
    const characterUserIds = new Set(this.characters().map((c) => c.userId));
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

    const owner = this.ownCharacter();
    if (owner) {
      try {
        this.ownNotes.set(await this.characterSvc.getNotes(owner.id));
      } catch {
        this.journalError.set("Impossible de charger votre journal.");
      }
    }
  }

  protected async participate(): Promise<void> {
    this.participantError.set(null);
    try {
      this.scenario.set(await this.scenarios.participate(this.scenario().id));
    } catch (err) {
      this.participantError.set(
        extractErrorMessage(err, 'Impossible de participer à ce scénario.'),
      );
    }
  }

  protected onSeanceLinked(updated: ScenarioDto): void {
    this.scenario.set(updated);
  }

  // Story 8.6 : réglage propriétaire-seul, par personnage (AC6) — aucun impact sur les notes déjà
  // associées manuellement (AC4), seulement sur le calcul de l'ensemble « auto » côté backend.
  protected async toggleAutoAssociate(value: boolean): Promise<void> {
    const owner = this.ownCharacter();
    if (!owner) return;
    this.journalError.set(null);
    try {
      const updated = await this.characterSvc.setJournalAutoAssociate(owner.id, value);
      this.characters.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      this.journalError.set(extractErrorMessage(err, 'Impossible de modifier ce réglage.'));
    }
  }

  // Revue de code (2026-07-14) : une note associée mais non partagée (`shared: false`) n'apparaît
  // jamais dans `retrospectiveNotes` (le backend filtre désormais `shared: true` sur la branche
  // manuelle, cf. fix confidentialité) — plutôt qu'un filtrage muet qui laisserait le joueur
  // perplexe devant une note cochée mais invisible, le cadenas est actionnable directement ici,
  // sans aller-retour vers la fiche de personnage.
  protected async toggleShare(note: CharacterNoteDto): Promise<void> {
    const owner = this.ownCharacter();
    if (!owner) return;
    this.journalError.set(null);
    try {
      const updated = await this.characterSvc.toggleNoteShare(owner.id, note.id, !note.shared);
      this.ownNotes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err) {
      this.journalError.set(
        extractErrorMessage(err, 'Impossible de modifier la visibilité de cette note.'),
      );
    }
  }

  // Association manuelle indépendante du switch (AC2) — `checked` détermine si on pose
  // `scenario().id` ou `null` (désassociation) sur la note visée.
  protected async toggleNoteAssociation(note: CharacterNoteDto, checked: boolean): Promise<void> {
    const owner = this.ownCharacter();
    if (!owner) return;
    this.journalError.set(null);
    try {
      const updated = await this.characterSvc.setNoteScenario(
        owner.id,
        note.id,
        checked ? this.scenario().id : null,
      );
      this.ownNotes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err) {
      this.journalError.set(
        extractErrorMessage(err, "Impossible de mettre à jour cette association."),
      );
    }
  }

  protected close(): void {
    this.dialogRef.close();
  }

  // Story 8.5 : seul chemin de navigation MJ → ScenarioEditor pour un scénario PASSE (fix revue de
  // code — ScenarioTimeline route toujours PASSE vers ce dialogue en lecture seule, sans quoi le
  // panneau de rédaction du résumé de fin serait inatteignable en pratique).
  protected editResume(): void {
    const s = this.scenario();
    this.dialogRef.close();
    void this.router.navigate(['/parties', s.partieId, 'scenarios', s.id], {
      state: { scenario: s },
    });
  }
}
