import { Component, ElementRef, inject, input, output } from '@angular/core';
import { ThemeToneService } from '../../../../core/theme/theme-tone.service';

/**
 * Le contenu du menu « ⋮ » de la fiche (Story 31.1, AC2/AC5) — composant de **rendu pur** : aucun
 * état, aucune connaissance des deux enveloppes qui l'entourent (menu ancré sur ordinateur,
 * feuille montant du bas sur téléphone). Même patron que `CalendarDisplayPanel` (Story 36.14).
 *
 * 🚨 Cinq actions, jamais une de plus (AC5) — « Modifier le portrait » (l'avatar, story 4.5) reste
 * hors de ce menu : ce n'est pas un export, c'est un réglage distinct qui vit dans l'en-tête.
 *
 * Aucune logique métier ici : les quatre exports et le recadrage restent dans `CharacterSheet`,
 * inchangés — ce composant se contente d'émettre l'intention et de laisser l'appelant fermer le
 * menu avant de la déclencher (AC4).
 */
@Component({
  selector: 'app-sheet-actions-menu',
  standalone: true,
  templateUrl: './sheet-actions-menu.html',
  styleUrl: './sheet-actions-menu.scss',
})
export class SheetActionsMenu {
  // 🚨 Aucun `input.required` : le piège a été payé quatre stories de suite dans l'épic 36
  // (36.9, 36.10, 36.11, 36.12). Défaut rendable.
  readonly showPdfCrop = input(false);

  readonly exportEditable = output<void>();
  readonly export2Pages = output<void>();
  readonly exportEquipment = output<void>();
  readonly exportNotes = output<void>();
  readonly cropPdfPortrait = output<void>();

  protected readonly theme = inject(ThemeToneService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /**
   * Revue de code 31.1 — filet de sécurité si le 5e item (recadrage PDF) disparaît EN COURS
   * D'OUVERTURE (`showPdfCrop()` bascule à `false` pendant que le lecteur a le focus dessus, ex.
   * rafraîchissement temps réel qui change le propriétaire/portrait). Le navigateur retire alors
   * le focus au document sans le redonner à personne — `(focusout)` sur le conteneur le détecte
   * (`relatedTarget` hors du menu, ou `null`) et le ramène sur le premier item restant plutôt que
   * de le laisser filer.
   */
  protected onMenuFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    queueMicrotask(() => {
      if (
        document.activeElement === document.body ||
        !this.host.nativeElement.contains(document.activeElement)
      ) {
        this.host.nativeElement.querySelector<HTMLButtonElement>('.actions-menu__item')?.focus();
      }
    });
  }
}
