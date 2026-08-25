import { Component, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CdkTrapFocus } from '@angular/cdk/a11y';

/**
 * Surface de détail adaptative (Story 31.2, FR-20) — panneau latéral sur ordinateur, feuille
 * montant du bas sur téléphone, la BASCULE ÉTANT PUREMENT CSS (`detail-surface.scss`, patron
 * repris de `ConstraintPanel`, seuil aligné sur `DESKTOP_QUERY = 1024px` du reste du projet plutôt
 * que les 768px propres à `ConstraintPanel`).
 *
 * Composant PARTAGÉ (`apps/web/src/app/shared/`) : les stories 31.3 (FR-19, glossaire de règles)
 * et 31.4 (FR-21, assistant de création) le réutilisent tel quel (EXPERIENCE.md:416,488).
 *
 * Rendu pur : `title`/`body` déjà résolus par l'appelant, aucune connaissance de qui l'affiche.
 * Auto-suffisant en accessibilité (`role="dialog"`, `CdkTrapFocus`, Échap) — contrairement à
 * `ConstraintPanel`, qui n'a ni l'un ni l'autre (cf. Dev Notes de la story, Encadré n°2) : chaque
 * futur consommateur obtient ce comportement gratuitement, sans le reconstruire.
 */
@Component({
  selector: 'app-detail-surface',
  standalone: true,
  imports: [CdkTrapFocus],
  templateUrl: './detail-surface.html',
  styleUrl: './detail-surface.scss',
})
export class DetailSurface {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  /** [Review][Patch] Jeton d'ouverture opaque — l'appelant incrémente une valeur à CHAQUE
   *  activation, y compris pour deux éléments dont le nom+texte seraient identiques. `title()`/
   *  `body()` seuls ne suffisent pas : deux chaînes égales ne redéclenchent pas l'effet ci-dessous
   *  (égalité de valeur des signaux), donc le focus ne rentrerait jamais dans le panneau pour ce
   *  cas précis (ex. le même talent choisi via la classe primaire ET secondaire). */
  readonly openToken = input<number>(0);
  readonly closed = output<void>();

  private readonly breakpointObserver = inject(BreakpointObserver);
  /** Même seuil unique que `CalendarView.DESKTOP_QUERY`/`CharacterSheet.DESKTOP_QUERY` — ne pas
   *  en introduire un second (règle établie par la story 31.1). */
  private static readonly DESKTOP_QUERY = '(min-width: 1024px)';
  /**
   * 🚨 Trouvé en revue de code : le backdrop est désactivé en desktop (CSS, `detail-surface.scss`)
   * pour laisser le reste de la fiche interactif (AC2/AC4), mais `cdkTrapFocus`/`aria-modal`
   * restaient actifs sans condition — un utilisateur clavier restait piégé dans le panneau même en
   * desktop, alors qu'un utilisateur souris pouvait librement cliquer un autre déclencheur. Piège
   * de focus et sémantique de dialogue modal désormais réservés à la présentation mobile (feuille),
   * seule où le reste de l'écran est réellement inerte.
   */
  protected readonly isDesktop = toSignal(
    this.breakpointObserver.observe(DetailSurface.DESKTOP_QUERY).pipe(map((r) => r.matches)),
    { initialValue: this.breakpointObserver.isMatched(DetailSurface.DESKTOP_QUERY) },
  );

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  /**
   * 🚨 Trouvé à la vérification visuelle (Task 4) : `cdkTrapFocusAutoCapture` ne capture le focus
   * qu'au MONTAGE du composant — quand l'appelant remplace `title`/`body` en place pendant que la
   * surface est déjà ouverte (AC4), le composant n'est jamais démonté/remonté, donc le focus
   * n'entre jamais dans le panneau et reste sur le bouton externe qui vient d'être cliqué. Sans
   * ça, `Échap` ne fait rien après un tel remplacement (l'événement ne bubble jamais jusqu'à
   * `.detail-surface-panel`). Corrigé en pilotant le focus nous-mêmes à CHAQUE changement de
   * contenu, pas seulement au premier — `cdkTrapFocusAutoCapture` retiré du template en
   * conséquence (gardé : `cdkTrapFocus`, pour le piège Tab uniquement).
   */
  private readonly focusOnContentChange = effect(() => {
    this.openToken();
    this.closeButton()?.nativeElement.focus();
  });

  protected close(): void {
    this.closed.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
  }
}
