import { Injectable, inject } from '@angular/core';
import { API_BASE } from '../api-base';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from '../scenarios/scenarios.service';

export function partieTopic(partieId: string): string {
  return `partie:${partieId}`;
}

export function userTopic(userId: string): string {
  return `user:${userId}`;
}

export interface TopicHandler {
  readonly prefix: string;
  notifyChanged(): void;
}

/** Pure, testable isolément — pas de couplage à Angular/EventSource. */
export function matchingHandlers(
  handlers: readonly TopicHandler[],
  topic: string,
): TopicHandler[] {
  return handlers.filter((h) => topic.startsWith(h.prefix));
}

function urlForTopic(topic: string): string {
  if (topic.startsWith('partie:')) {
    return `${API_BASE}/parties/${topic.slice('partie:'.length)}/events`;
  }
  if (topic.startsWith('user:')) {
    return `${API_BASE}/users/me/events`;
  }
  throw new Error(`Topic non reconnu : ${topic}`);
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly parties = inject(PartiesService);
  private readonly scenarios = inject(ScenariosService);

  // Table de correspondance topic-prefix -> services à notifier (AD-3), câblée ici, dans
  // RealtimeService lui-même (jamais par le composant appelant connect()/disconnect()) —
  // première entrée réelle (Story 18.3), étendue Story 19.1 avec une deuxième entrée au MÊME
  // préfixe (plusieurs handlers peuvent partager un préfixe — matchingHandlers les appelle tous).
  private readonly handlers: TopicHandler[] = [
    { prefix: 'partie:', notifyChanged: () => this.parties.notifyChanged() },
    { prefix: 'partie:', notifyChanged: () => this.scenarios.notifyRealtimeChanged() },
  ];

  // Une entrée par connexion active (pas par topic) — deux connect() sur le même topic ouvrent
  // deux EventSource indépendants, jamais partagés/dédupliqués (AD-6). disconnect() dépile la
  // plus récente (LIFO) : discipline naturelle pour un dialogue ouvert par-dessus une page déjà
  // connectée sur le même topic (Epic 19, ScenarioEditor/ScenarioReadDialog).
  private readonly connections = new Map<string, EventSource[]>();

  connect(topic: string): void {
    const es = new EventSource(urlForTopic(topic), { withCredentials: true });
    const onSignal = () => {
      // Chaque handler est isolé (Story 19.1, revue de code) : plusieurs services de domaine
      // partagent désormais le même préfixe — une exception dans l'un ne doit jamais empêcher
      // la notification des autres.
      for (const h of matchingHandlers(this.handlers, topic)) {
        try {
          h.notifyChanged();
        } catch {
          // non-bloquant — un service de domaine en échec ne doit pas empêcher les autres
        }
      }
    };
    // 'open' : connexion initiale ET chaque reconnexion réussie (AC4, AD-8) — rattrapage.
    // 'message' : un par emit() serveur reçu pendant une connexion stable (AC4) — chemin
    // primaire de notification, pas seulement le rattrapage post-coupure.
    es.addEventListener('open', onSignal);
    es.addEventListener('message', onSignal);
    // Aucun listener 'error' : reconnexion native EventSource, silencieuse (AC3, AD-8).
    const list = this.connections.get(topic) ?? [];
    list.push(es);
    this.connections.set(topic, list);
  }

  disconnect(topic: string): void {
    const list = this.connections.get(topic);
    if (!list || list.length === 0) return;
    const es = list.pop()!;
    es.close();
    if (list.length > 0) this.connections.set(topic, list);
    else this.connections.delete(topic);
  }
}
