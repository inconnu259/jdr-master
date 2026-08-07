import { Injectable, computed, inject, signal } from '@angular/core';
import type { PartieDto } from '@master-jdr/shared';
import { PartiesService } from '../parties/parties.service';

@Injectable({ providedIn: 'root' })
export class MyPartiesService {
  private readonly parties = inject(PartiesService);

  /** Les parties que l'utilisateur maîtrise. */
  readonly mjParties = signal<PartieDto[]>([]);
  /** Les parties où l'utilisateur est joueur. */
  readonly playerParties = signal<PartieDto[]>([]);
  readonly hasMjParties = computed(() => this.mjParties().length > 0);
  /** Liste unifiée (Story 29.1, FR-7) — `role` est déjà porté par chaque `PartieDto` (projection
   *  serveur, AD-15), simple concaténation, aucun tri ni regroupement (hors périmètre). */
  readonly allParties = computed(() => [...this.mjParties(), ...this.playerParties()]);

  private mjSeq = 0;
  private playerSeq = 0;

  constructor() {
    // Nettoyage (revue de code, Story 29.1) : l'ancien `ModeService.setMode()` écrivait cette clé,
    // désormais orpheline — plus rien ne la lit, mais elle restait indéfiniment dans le
    // localStorage des utilisateurs ayant déjà basculé de mode avant ce refactor.
    if (typeof localStorage !== 'undefined') localStorage.removeItem('master-jdr.mode');
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
    if (list) this.mjParties.set(list);
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

  /** Contrat public AD-4 (zéro argument) — RealtimeService l'appelle sur un événement SSE
   *  user:{id} (bug fix : reculé depuis le préfixe générique 'partie:', cf. RealtimeService — la
   *  liste d'appartenance ne change jamais via une mutation partie-scopée générique comme un vote
   *  ou un scénario). Relance directement les deux méthodes de rafraîchissement publiques. */
  notifyChanged(): void {
    void this.refreshMjParties();
    void this.refreshPlayerParties();
  }
}
