import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import type { DetailRow } from './detail-surface-host';

/**
 * Surface de détail adaptative (Story 31.2, FR-20) — feuille montant du bas sur téléphone,
 * **fenêtre centrée modale** sur ordinateur. La bascule de présentation est purement CSS
 * (`detail-surface.scss`), au seuil unique `1024px` du reste du projet.
 *
 * ⚠️ Story 31.4 (contrat UI `ux-jdr-master-2026-08-31`, DESIGN §7.2) : sur ordinateur elle était un
 * panneau latéral NON modal (décision de la revue de la 31.2 : voile masqué, `aria-modal` et piège
 * de focus désactivés pour laisser la fiche interactive). Décision de l'utilisateur, 2026-09-20 :
 * fenêtre centrée, modale PARTOUT — voile visible, `aria-modal`, piège de focus, `Échap` et clic sur
 * le voile ferment. Conséquence : le voile recouvre les déclencheurs, il n'y a plus de
 * « remplacement en place » d'un terme par un autre (déjà vrai sur mobile).
 *
 * Composant PARTAGÉ (`apps/web/src/app/shared/`), utilisé par la fiche et l'assistant de création.
 * Rendu pur : contenu déjà résolu par l'appelant, aucune connaissance de qui l'affiche. Corps soit
 * en texte simple (`body`), soit structuré : tableau mécanique (`rows`) puis récit (`narrative`),
 * ce dernier replié par défaut sur téléphone.
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
  /** Corps de texte simple — ignoré quand `rows` ou `narrative` sont fournis. */
  readonly body = input<string>('');
  /** Tableau mécanique (Story 31.4) : lignes libellé / valeur, déjà filtrées par l'appelant. */
  readonly rows = input<DetailRow[]>([]);
  /** Récit d'ambiance, après le tableau. */
  readonly narrative = input<string>('');
  /** [Review][Patch] Jeton d'ouverture opaque — l'appelant incrémente une valeur à CHAQUE
   *  activation, y compris pour deux éléments dont le nom+texte seraient identiques. `title()`/
   *  `body()` seuls ne suffisent pas : deux chaînes égales ne redéclenchent pas l'effet ci-dessous
   *  (égalité de valeur des signaux), donc le focus ne rentrerait jamais dans le panneau pour ce
   *  cas précis (ex. le même talent choisi via la classe primaire ET secondaire). */
  readonly openToken = input<number>(0);
  /** Contenu PROJETÉ par l'appelant (`<ng-content>`, ex. le récapitulatif du wizard) : ni corps de
   *  texte ni repli « Aucune description disponible ». */
  readonly custom = input<boolean>(false);
  readonly closed = output<void>();

  protected readonly theme = inject(ThemeToneService);

  private readonly breakpointObserver = inject(BreakpointObserver);
  /** Même seuil unique que `CalendarView.DESKTOP_QUERY`/`CharacterSheet.DESKTOP_QUERY` — ne pas
   *  en introduire un second (règle établie par la story 31.1). */
  private static readonly DESKTOP_QUERY = '(min-width: 1024px)';

  /** Sert UNIQUEMENT à la divulgation du récit (mobile) : la modalité, elle, est inconditionnelle. */
  protected readonly isDesktop = toSignal(
    this.breakpointObserver.observe(DetailSurface.DESKTOP_QUERY).pipe(map((r) => r.matches)),
    { initialValue: this.breakpointObserver.isMatched(DetailSurface.DESKTOP_QUERY) },
  );

  /** Jeton d'ouverture pour lequel le récit a été déplié (mobile). Dérivé du jeton plutôt que
   *  remis à zéro par un `effect()` : le récit est ainsi replié à CHAQUE ouverture, jamais hérité
   *  du terme précédent, sans dépendre d'un effet dont le harnais zoneless ne garantit pas le
   *  re-déclenchement (cf. `detail-surface.spec.ts`). */
  private readonly narrativeOpenedFor = signal<number | null>(null);
  protected readonly narrativeOpen = computed(() => this.narrativeOpenedFor() === this.openToken());

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  /**
   * 🚨 Trouvé à la vérification visuelle (31.2) : `cdkTrapFocusAutoCapture` ne capture le focus
   * qu'au MONTAGE du composant. Le focus est donc piloté ici, à CHAQUE ouverture (`openToken`), et
   * `cdkTrapFocusAutoCapture` est absent du template (gardé : `cdkTrapFocus`, pour le piège Tab).
   */
  private readonly focusOnContentChange = effect(() => {
    this.openToken();
    this.closeButton()?.nativeElement.focus();
  });

  /** Le tableau existe : le récit peut se replier derrière lui. Sans tableau, le récit est le seul
   *  contenu — le cacher derrière un bouton ne laisserait qu'un panneau vide. */
  protected hasRows(): boolean {
    return this.rows().length > 0;
  }

  protected isStructured(): boolean {
    return this.hasRows() || !!this.narrative();
  }

  protected toggleNarrative(): void {
    this.narrativeOpenedFor.set(this.narrativeOpen() ? null : this.openToken());
  }

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
