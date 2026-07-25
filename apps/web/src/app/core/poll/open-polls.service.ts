import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { SessionPollDto } from '@master-jdr/shared';
import { AuthService } from '../auth/auth.service';
import { ModeService } from '../mode/mode.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { hasUnansweredOptions } from './poll.util';

@Injectable({ providedIn: 'root' })
export class OpenPollsService {
  private readonly modeSvc = inject(ModeService);
  private readonly scenariosSvc = inject(ScenariosService);
  private readonly authSvc = inject(AuthService);

  readonly openPolls = signal<Map<string, SessionPollDto>>(new Map());
  readonly count = computed(() => this.openPolls().size);

  // Bug fix (revue de code) : un compteur `seq` UNIQUE partagé entre refresh() (toutes les
  // Parties) et refreshOne() (une seule Partie) faisait qu'un refreshOne() plus rapide pouvait
  // invalider un refresh() encore en vol alors que son résultat est un sur-ensemble — les polls
  // des AUTRES Parties de ce refresh() étaient alors silencieusement perdus pour le reste de la
  // session (cas concret : rechargement direct d'une page Partie, où Shell.refreshPlayerParties()
  // et le canal SSE partie:{id} de la page démarrent quasi simultanément). Un compteur par Partie
  // permet à refresh()/refreshOne() de s'entrelacer sans s'invalider : seule la requête la plus
  // récente POUR CETTE PARTIE gagne, peu importe qu'elle vienne de l'une ou l'autre méthode.
  private readonly seqByPartie = new Map<string, number>();

  constructor() {
    effect(() => {
      void this.refresh();
    });
  }

  /** Contrat public AD-4 — RealtimeService l'appelle sur un événement SSE partie:{id} en
   *  transmettant le topic déclencheur. Bug fix (production, tempête de requêtes) : un événement
   *  sur UNE Partie déclenchait auparavant un refetch de `scenariosSvc.listAll()` pour TOUTES les
   *  Parties du joueur (refresh() ci-dessous) — on scope désormais le rafraîchissement à la seule
   *  Partie concernée par le topic. */
  notifyChanged(topic: string): void {
    const partieId = topic.startsWith('partie:') ? topic.slice('partie:'.length) : null;
    if (partieId) void this.fetchOne(partieId);
    else void this.refresh();
  }

  /** Poll OPEN en attente de réponse pour `userId` parmi les scénarios d'une Partie, ou le premier
   *  poll OPEN si `userId` est inconnu (partagé par refresh()/fetchOne() — Story 8.8). */
  private static findPending(
    scenarios: Awaited<ReturnType<ScenariosService['listAll']>>,
    userId: string | undefined,
  ): SessionPollDto | undefined {
    const openPolls: SessionPollDto[] = [];
    for (const scenario of scenarios) {
      for (const seance of scenario.seances) {
        if (seance.poll?.status === 'OPEN') openPolls.push(seance.poll);
      }
    }
    return userId ? openPolls.find((poll) => hasUnansweredOptions(poll, userId)) : openPolls[0];
  }

  private async refresh(): Promise<void> {
    const parties = this.modeSvc.playerParties();
    const partieIds = new Set(parties.map((p) => p.id));
    // Purge immédiate (synchrone, ne dépend d'aucune requête réseau) des entrées des Parties
    // quittées — avant même de relancer les fetch, pour ne jamais laisser une entrée orpheline
    // si `parties` est vide (dernière Partie quittée) ou a rétréci.
    // Bug fix (revue de code) : `untracked()` est indispensable ici — refresh() est appelé
    // directement depuis l'effect() du constructeur (`void this.refresh()`), donc toute lecture
    // synchrone de `openPolls()` avant le premier `await` serait autrement capturée comme
    // dépendance de CET effect, qui ne doit dépendre que de `playerParties()` — sans cette garde,
    // la moindre écriture ultérieure sur `openPolls` (ex. par fetchOne()) redéclencherait cet
    // effect en boucle (refresh() → fetchOne() → écriture → effect → refresh() → …).
    untracked(() => {
      const current = this.openPolls();
      if ([...current.keys()].some((id) => !partieIds.has(id))) {
        const pruned = new Map(current);
        for (const id of current.keys()) if (!partieIds.has(id)) pruned.delete(id);
        this.openPolls.set(pruned);
      }
    });
    // Story 8.8 (revue de code) : ScenariosService.listAll() remplace PollService.getCurrentPoll()
    // (un seul poll par Partie, findFirst arbitraire) — plusieurs votes OPEN peuvent désormais
    // coexister sur une même Partie (Décision 2). Sans ce fix, un joueur avec un vote déjà répondu
    // ET un second vote encore en attente sur la même Partie pouvait ne jamais être notifié du
    // second si le refetch renvoyait arbitrairement le premier (déjà répondu).
    await Promise.allSettled(parties.map((p) => this.fetchOne(p.id)));
  }

  /** Rafraîchissement d'une seule Partie, partagé par refresh() (fan-out complet) et
   *  notifyChanged() (scopé, cf. bug fix tempête de requêtes). Compteur par Partie (seqByPartie) :
   *  seule la requête la plus récente POUR CETTE PARTIE s'applique, qu'elle vienne d'un refresh()
   *  complet ou d'un notifyChanged() scopé — les autres entrées de la Map ne sont pas touchées. */
  private async fetchOne(partieId: string): Promise<void> {
    const seq = (this.seqByPartie.get(partieId) ?? 0) + 1;
    this.seqByPartie.set(partieId, seq);
    let scenarios: Awaited<ReturnType<typeof this.scenariosSvc.listAll>>;
    try {
      scenarios = await this.scenariosSvc.listAll(partieId);
    } catch {
      return; // échec transitoire : on garde le dernier état connu bon pour cette Partie
    }
    if (this.seqByPartie.get(partieId) !== seq) return; // une requête plus récente pour cette Partie a déjà été lancée
    const userId = this.authSvc.currentUser()?.id;
    const pending = OpenPollsService.findPending(scenarios, userId);
    const map = new Map(this.openPolls());
    if (pending) map.set(partieId, pending);
    else map.delete(partieId);
    this.openPolls.set(map);
  }
}
