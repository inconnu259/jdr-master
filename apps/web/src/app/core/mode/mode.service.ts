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
  /** Les parties où l'utilisateur est joueur (dashboard Joueur). */
  readonly playerParties = signal<PartieDto[]>([]);
  /** Le toggle MJ ne s'affiche que si on maîtrise au moins une partie. */
  readonly hasMjParties = computed(() => this.mjParties().length > 0);

  private mjSeq = 0;
  private playerSeq = 0;

  setMode(m: Mode): void {
    this.mode.set(m);
    localStorage.setItem(KEY, m);
  }

  // Bug fix critique (production) : un vote créé sur N'IMPORTE QUELLE Partie déclenchait un
  // rafraîchissement complet et non protégé de playerParties — deux appels concurrents (ex. Shell
  // au bootstrap + une reconnexion SSE) pouvaient résoudre dans le désordre, et le moindre échec
  // réseau transitoire vidait silencieusement TOUTE la liste des Parties du joueur (`.set([])`),
  // sans jamais se réparer avant le prochain déclenchement réussi. Compteur `seq` (même pattern que
  // OpenPollsService.refresh()) : une réponse obsolète ne peut plus écraser un état plus frais, et
  // un échec ne vide plus jamais la liste — le dernier état connu bon est conservé.
  async refreshMjParties(): Promise<void> {
    const seq = ++this.mjSeq;
    let list: PartieDto[] | undefined;
    try {
      list = await this.parties.list('mj');
    } catch {
      // Échec transitoire : on garde le dernier état connu bon, pas de `.set([])`.
    }
    if (seq !== this.mjSeq) return; // réponse obsolète, une requête plus récente est en vol
    if (list) {
      this.mjParties.set(list);
      // Si on n'est MJ de rien, on ne peut pas rester en mode MJ — évalué uniquement après un
      // succès confirmé (jamais sur un échec, qui laisserait la liste précédente inchangée).
      if (!this.hasMjParties() && this.mode() === 'mj') this.setMode('joueur');
    }
  }

  async refreshPlayerParties(): Promise<void> {
    const seq = ++this.playerSeq;
    let list: PartieDto[] | undefined;
    try {
      list = await this.parties.list('player');
    } catch {
      // Échec transitoire : on garde le dernier état connu bon, pas de `.set([])`.
    }
    if (seq !== this.playerSeq) return;
    if (list) this.playerParties.set(list);
  }

  /** Contrat public AD-4 (zéro argument) — RealtimeService l'appelle désormais sur un événement SSE
   *  user:{id} (bug fix : reculé depuis le préfixe générique 'partie:', cf. RealtimeService — la
   *  liste d'appartenance ne change jamais via une mutation partie-scopée générique comme un vote
   *  ou un scénario). Pas d'effect() interne existant (contrairement à ce que suggère
   *  ARCHITECTURE-SPINE.md AD-4 point 3, qui décrit en réalité l'effect() d'OpenPollsService) —
   *  relance directement les deux méthodes de rafraîchissement publiques déjà existantes. */
  notifyChanged(): void {
    void this.refreshMjParties();
    void this.refreshPlayerParties();
  }

  private readStoredMode(): Mode {
    return localStorage.getItem(KEY) === 'mj' ? 'mj' : 'joueur';
  }
}
