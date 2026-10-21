import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { fillTone } from '../../../core/theme/tone-format';

/** Une séance sans vote encore lancé, telle que le dialogue a besoin de la connaître. */
export interface ComposeSeanceChoice {
  seanceId: string;
  /** « Les Cendres d'Ashal — Séance 2 » : scénario ET séance, sans ambiguïté. */
  label: string;
}

export interface ComposeConfirmData {
  /** `'new'` = créer un vote (il faut lui désigner une séance) · `'poll'` = modifier un vote
   *  existant (il faut avertir de ce qui va être détruit). Les deux faces sont **exclusives** :
   *  un vote qui n'existe pas encore ne porte aucune réponse à perdre. */
  mode: 'new' | 'poll';
  /** Nombre de créneaux que la composition va poser. */
  slotCount: number;
  /** Mode `poll` : combien de créneaux sont retirés. */
  removedCount: number;
  /** Mode `poll` : combien de RÉPONSES seront supprimées avec eux (AC6 — c'est CE nombre que
   *  l'écran doit nommer). */
  voterCount: number;
  /** Mode `new` : les séances éligibles. Jamais vide — sans séance, la validation n'est pas
   *  proposée du tout (AC11). */
  seances: ComposeSeanceChoice[];
  /** Story 40.5b : conjonction d'un groupe — mêmes questions, avec les mots du groupe (créneaux, pas
   *  de séance). Absent pour un vote de JDR, dont les textes ne changent pas. */
  group?: boolean;
}

/**
 * Story 36.10 — la dernière question avant l'écriture.
 *
 * Deux faces exclusives, un seul dialogue parce que c'est un seul moment du parcours :
 *
 * - **Créer** (`mode: 'new'`) — désigner la séance à laquelle le vote appartiendra. 🚨 Cette
 *   question n'est pas une commodité : un `SessionPoll` sans `Seance` est structurellement
 *   interdit depuis la story 8.8 (votes orphelins jamais nettoyés), et la route de création
 *   générique n'existe plus. La 36.10 retire le sélecteur « Planifier un vote pour : » de
 *   l'Oracle (AC9) : la question est **déplacée après la désignation des créneaux**, pas
 *   supprimée — le premier geste redevient la grille, ce que FR-52 demande.
 * - **Modifier** (`mode: 'poll'`) — avertir AVANT, en nommant le nombre de votants concernés,
 *   et laisser renoncer (AC6, Q-22). Retirer une option supprime les réponses qu'elle portait.
 *
 * Story 40.5b : pour la conjonction d'un groupe (`data.group`), seule la face « modifier » existe (la
 * création n'écrit rien avant la fenêtre de création) ; les textes viennent des clés `ralliement`.
 *
 * Il n'écrit rien : il rend une décision à `CalendarView`, qui émet l'unique appel.
 */
@Component({
  selector: 'app-compose-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './compose-confirm-dialog.html',
  styleUrl: './compose-confirm-dialog.scss',
})
export class ComposeConfirmDialog {
  private readonly dialogRef =
    inject<MatDialogRef<ComposeConfirmDialog, { seanceId: string | null } | null>>(MatDialogRef);
  protected readonly data = inject<ComposeConfirmData>(MAT_DIALOG_DATA);
  protected readonly theme = inject(ThemeToneService);

  /** Mode `new` : la séance retenue. Pré-remplie quand il n'y en a qu'une — la question ne se
   *  pose alors pas vraiment. */
  protected readonly seanceId = signal<string | null>(
    this.data.seances.length === 1 ? this.data.seances[0].seanceId : null,
  );

  /** Clé de texte selon l'origine : JDR (`calendar.compose_confirm_*`) ou groupe. */
  protected tk(suffix: string): string {
    return this.data.group
      ? `partie.ralliement_calendar_confirm_${suffix}`
      : `calendar.compose_confirm_${suffix}`;
  }

  /** Titre de la face « modifier ». */
  protected readonly modifyTitle = computed(
    () => this.theme.tone()[this.data.group ? this.tk('title') : this.tk('title_modify')],
  );
  /** Note sous l'avertissement : les réponses des créneaux conservés ne sont pas touchées. */
  protected readonly note = computed(() => this.theme.tone()[this.tk('note')]);

  protected readonly canConfirm = computed(
    () => this.data.mode === 'poll' || this.seanceId() !== null,
  );

  /** AC6 — le nombre de votants est NOMMÉ, jamais résumé en « des réponses seront perdues ». */
  protected readonly warning = computed(() => {
    const { removedCount, voterCount } = this.data;
    const tone = this.theme.tone();
    const slotsKey = this.tk(removedCount > 1 ? 'slots_many' : 'slots_one');
    const votesKey = this.tk(voterCount > 1 ? 'responses_many' : 'responses_one');
    const warningKey = this.tk(voterCount > 1 ? 'warning_many' : 'warning_one');
    return fillTone(tone[warningKey], {
      slots: fillTone(tone[slotsKey], { n: removedCount }),
      votes: fillTone(tone[votesKey], { n: voterCount }),
    });
  });

  /** Nombre de créneaux que la composition va poser, accordé en nombre. */
  protected readonly summary = computed(() => {
    const { slotCount } = this.data;
    const key = this.tk(slotCount > 1 ? 'summary_many' : 'summary_one');
    return fillTone(this.theme.tone()[key], { n: slotCount });
  });

  protected onSeanceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.seanceId.set(value === '' ? null : value);
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;
    this.dialogRef.close({ seanceId: this.seanceId() });
  }

  /** `null` = on renonce. L'appelant garde sa composition intacte (AC6). */
  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
