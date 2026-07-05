import { Directive, ElementRef, HostListener, inject } from '@angular/core';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Navigation clavier par flèches entre les `[role="radio"]` (ici, des `app-choice-card`) d'un
 * conteneur `role="radiogroup"` — pattern WAI-ARIA standard pour une sélection à choix unique
 * (classe/type/arme), en plus du `Tab`/`clic` déjà fonctionnels nativement sur chaque bouton.
 */
@Directive({
  selector: '[appRadioGroupNav]',
  standalone: true,
})
export class RadioGroupNavDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (!NEXT_KEYS.has(event.key) && !PREV_KEYS.has(event.key)) return;

    const radios = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[role="radio"]'),
    );
    if (radios.length === 0) return;
    const currentIndex = radios.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1) return;

    event.preventDefault();
    const delta = NEXT_KEYS.has(event.key) ? 1 : -1;
    const next = radios[(currentIndex + delta + radios.length) % radios.length];
    next.focus();
    next.click();
  }
}
