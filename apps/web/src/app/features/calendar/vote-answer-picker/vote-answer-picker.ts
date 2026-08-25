import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  viewChildren,
} from '@angular/core';
import type { VoteAnswer } from '@master-jdr/shared';
import { type VoteParticipation, answerLabel } from '../poll-track.utils';

/** L'ordre du contrat d'UI : **oui, peut-être, non** (`contrat-ui-calendrier.html:628-631`).
 *
 *  🚨 Ce n'est PAS l'ordre de `PollResponseComponent.VOTE_OPTIONS` (`YES, NO, MAYBE`). Deux
 *  écrans, deux ordres — ne pas « harmoniser » l'un sur l'autre sans repasser par le contrat. */
const ANSWERS: readonly VoteAnswer[] = ['YES', 'MAYBE', 'NO'] as const;

/**
 * Story 36.7 — le sélecteur de réponse de vote.
 *
 * **Composant de RENDU PUR.** Il n'injecte aucun service, n'appelle rien, ne connaît ni HTTP ni
 * routes : il affiche trois choix et émet celui qu'on lui désigne. C'est `CalendarView` qui écrit
 * (patron `PollTrack`, `SelectionBar`, `CalendarDetailRail`).
 *
 * **Pourquoi un sélecteur et pas un tap qui répond** — arbitrage de la collision 4
 * (`EXPERIENCE.md` §6 bis, 2026-08-17) : *un tap est binaire, une réponse de vote ne l'est pas.*
 * Un cycle n'annonce pas son ordre, et « tap = oui » rendrait le non plus coûteux que le oui,
 * ce qui biaiserait les réponses.
 *
 * **Un seul sélecteur pour les quatre surfaces** (case du Mois, cellule de Semaine, rail,
 * Agenda) : il est instancié une fois par `CalendarView`, dans un overlay ancré sur la bande
 * touchée. Deux implémentations produiraient deux façons de répondre selon l'écran.
 *
 * **Accessibilité (AC13).** Le motif ARIA est celui d'un menu : `role="menu"` nommé par le jour
 * et le créneau, trois `menuitemradio` dont l'état `aria-checked` dit lequel est le mien, et un
 * `menuitem` pour le retrait. La pastille de couleur ne porte donc **jamais** l'information
 * seule — le mot est là, `.sel` est un fond, et `aria-checked` le dit au lecteur d'écran (P-1).
 */
@Component({
  selector: 'app-vote-answer-picker',
  standalone: true,
  imports: [],
  templateUrl: './vote-answer-picker.html',
  styleUrl: './vote-answer-picker.scss',
})
export class VoteAnswerPicker {
  readonly vote = input.required<VoteParticipation>();
  /** Le jour et le créneau, DÉJÀ composés par `CalendarView` — les formateurs de date y vivent
   *  déjà (`CALENDAR_CELL_DATE_FORMAT`, `SLOT_LABELS`). Ce composant ne formate rien. */
  readonly slotLabel = input.required<string>();
  /** Une écriture est en vol : toutes les entrées sont désactivées (AC11). */
  readonly busy = input(false);

  readonly answerChosen = output<VoteAnswer>();
  readonly withdrawRequested = output<void>();

  protected readonly ANSWERS = ANSWERS;

  private readonly answerButtons = viewChildren<ElementRef<HTMLButtonElement>>('answerBtn');

  /** AC7 / encadré n°5 piège 2 — le focus doit ENTRER dans le sélecteur à l'ouverture, jamais
   *  seulement en ressortir (`CalendarView.closePicker()` gère déjà le retour à l'ancre). Cible
   *  ma réponse courante si j'en ai une, sinon la première entrée — comme le ferait un groupe de
   *  boutons radio natif. */
  constructor() {
    afterNextRender(() => {
      const buttons = this.answerButtons();
      const mine = buttons.find(
        (btn) => btn.nativeElement.dataset['answer'] === this.vote().myAnswer,
      );
      (mine ?? buttons[0])?.nativeElement.focus();
    });
  }

  /** Les mots viennent d'`answerLabel()`, point unique du vocabulaire depuis la story 36.6 : la
   *  bande, le rail, l'Agenda et ce sélecteur disent « oui », « peut-être », « non » de la même
   *  façon. Aucun second vocabulaire ici. */
  protected label(answer: VoteAnswer): string {
    return answerLabel(answer, 'compact');
  }

  protected isMine(answer: VoteAnswer): boolean {
    return this.vote().myAnswer === answer;
  }

  /** Le retrait n'est proposé que sur une réponse RÉELLEMENT posée (AC2). Sans cette garde, on
   *  offrirait de retirer ce qui n'existe pas — défaut que `PollResponseComponent` avait dû
   *  corriger en revue (story 30.1, `confirmedOptionIds`). */
  protected readonly canWithdraw = computed(() => this.vote().myAnswer !== null);

  protected choose(answer: VoteAnswer): void {
    if (this.busy()) return;
    this.answerChosen.emit(answer);
  }

  protected withdraw(): void {
    if (this.busy() || !this.canWithdraw()) return;
    this.withdrawRequested.emit();
  }
}
