import { Injectable, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Bandeau contextuel du Shell (Story 29.4) : titre + sous-titre optionnel, propres à l'écran
 * courant. `clear()` est déclenché sur NavigationStart — jamais NavigationEnd, qui se déclenche
 * après ngOnInit() du nouveau composant et effacerait le titre que celui-ci vient de poser.
 */
@Injectable({ providedIn: 'root' })
export class ContextualNavService {
  readonly title = signal<string | null>(null);
  readonly subtitle = signal<string | null>(null);

  constructor() {
    // Pas de takeUntilDestroyed() : service root, vit pour toute la durée de l'app — rien à désabonner.
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationStart))
      .subscribe(() => this.clear());
  }

  set(config: { title: string; subtitle?: string | null }): void {
    this.title.set(config.title);
    this.subtitle.set(config.subtitle ?? null);
  }

  clear(): void {
    this.title.set(null);
    this.subtitle.set(null);
  }
}
