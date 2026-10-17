import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { CreateEventDto, EventCardDto, UpdateEventDto } from '@master-jdr/shared';
import { API_BASE } from '../../core/api-base';

/**
 * Conjonctions d'un groupe de ralliement (Stories 40.1 et 40.2) — accès HTTP seul, aucun état.
 *
 * 🚨 La liste vit sur `GET /parties/:id/events/list` : `GET /parties/:id/events` est le flux temps
 * réel (SSE) de la partie. Le rafraîchissement en direct ne passe PAS par un nouveau handler
 * `'partie:'` (checklist) : l'onglet réagit au signal `PartiesService.changed()`, déjà câblé sur le
 * canal `partie:{id}` de la page.
 */
@Injectable({ providedIn: 'root' })
export class EventsApiService {
  private readonly http = inject(HttpClient);

  /** Une requête par appel, JAMAIS partagée avec une requête déjà en vol : la relecture qui suit
   *  une création doit voir l'état validé, pas un instantané pris avant. La péremption des réponses
   *  est gérée par l'appelant (compteur de requêtes de `ConjonctionsTab`). */
  list(partieId: string): Promise<EventCardDto[]> {
    return firstValueFrom(
      this.http.get<EventCardDto[]>(`${API_BASE}/parties/${partieId}/events/list`, {
        withCredentials: true,
      }),
    );
  }

  create(partieId: string, dto: CreateEventDto): Promise<EventCardDto> {
    return firstValueFrom(
      this.http.post<EventCardDto>(`${API_BASE}/parties/${partieId}/events`, dto, {
        withCredentials: true,
      }),
    );
  }

  /** Story 40.2 : l'hôte remplace sa conjonction (`PATCH /parties/:id/events/:eventId`) — renvoie
   *  la carte à jour, participants compris. */
  update(partieId: string, eventId: string, dto: UpdateEventDto): Promise<EventCardDto> {
    return firstValueFrom(
      this.http.patch<EventCardDto>(`${API_BASE}/parties/${partieId}/events/${eventId}`, dto, {
        withCredentials: true,
      }),
    );
  }
}
