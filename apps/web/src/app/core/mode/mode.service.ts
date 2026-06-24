import { Injectable, computed, inject, signal } from '@angular/core';
import type { PartieDto } from '@master-jdr/shared';
import { PartiesService } from '../parties/parties.service';

type Mode = 'joueur' | 'mj';
const KEY = 'master-jdr.mode';

@Injectable({ providedIn: 'root' })
export class ModeService {
  private readonly parties = inject(PartiesService);

  readonly mode = signal<Mode>(this.readStoredMode());
  /** Les parties que l'utilisateur maîtrise (source unique : pilote le toggle ET le dashboard MJ). */
  readonly mjParties = signal<PartieDto[]>([]);
  /** Le toggle MJ ne s'affiche que si on maîtrise au moins une partie. */
  readonly hasMjParties = computed(() => this.mjParties().length > 0);

  setMode(m: Mode): void {
    this.mode.set(m);
    localStorage.setItem(KEY, m);
  }

  async refreshMjParties(): Promise<void> {
    try {
      this.mjParties.set(await this.parties.list('mj'));
    } catch {
      this.mjParties.set([]);
    }
    // Si on n'est MJ de rien, on ne peut pas rester en mode MJ.
    if (!this.hasMjParties() && this.mode() === 'mj') this.setMode('joueur');
  }

  private readStoredMode(): Mode {
    return localStorage.getItem(KEY) === 'mj' ? 'mj' : 'joueur';
  }
}
