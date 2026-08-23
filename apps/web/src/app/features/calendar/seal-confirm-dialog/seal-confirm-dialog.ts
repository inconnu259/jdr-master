import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

export interface SealConfirmData {
  /** Le créneau qui sera retenu, déjà formaté — « ven. 28 août, soir ». La confirmation doit
   *  NOMMER ce qu'elle scelle : « Confirmer ? » ne dit pas quelle date on grave. */
  dateLabel: string;
  /** Le scénario (ou la partie) que porte le vote, pour lever toute ambiguïté quand plusieurs
   *  votes sont ouverts en parallèle — ce qui est le cas normal depuis la story 8.8. */
  pollLabel: string;
}

/**
 * Story 36.12, AC11 — la dernière question avant un scellement.
 *
 * 🚨 **Pourquoi une confirmation ici alors que la fiche de scénario n'en demande aucune.**
 * `PollService.choose()` fait passer le vote à `CLOSED`, pose `chosenDate`/`chosenSlot` et écrit
 * `Partie.nextSessionDate` : **il n'existe aucun retour en arrière côté produit**. Sur la fiche de
 * scénario, le bouton vit à côté de la liste complète des options et de leurs votants — le geste y
 * est délibéré par construction. Dans l'Agenda, il est à un doigt d'un bouton de réponse, sur une
 * ligne qu'on vient peut-être seulement de déplier. Le projet confirme déjà les pertes chiffrées
 * (`ComposeConfirmDialog`, story 36.10) ; une perte irréversible mérite au moins autant.
 *
 * ⚠️ L'asymétrie avec la fiche de scénario est consignée — l'harmoniser est une décision produit,
 * pas une décision de cette story.
 *
 * Il n'écrit rien : il rend une décision à `CalendarView`, qui émet l'unique appel.
 */
@Component({
  selector: 'app-seal-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './seal-confirm-dialog.html',
})
export class SealConfirmDialog {
  private readonly dialogRef = inject<MatDialogRef<SealConfirmDialog, boolean>>(MatDialogRef);
  protected readonly data = inject<SealConfirmData>(MAT_DIALOG_DATA);
  protected readonly theme = inject(ThemeToneService);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  /** `false` plutôt que `undefined` pour un clic explicite sur *Renoncer*. Une fermeture par
   *  `Échap` ou par un clic à côté ne passe PAS par ici — `MatDialogRef` la ferme avec `undefined`
   *  directement — mais l'appelant (`CalendarView.onSealRequested`) teste `!confirmed`, donc les
   *  deux valeurs (`false` et `undefined`) sont traitées identiquement comme un renoncement. */
  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
