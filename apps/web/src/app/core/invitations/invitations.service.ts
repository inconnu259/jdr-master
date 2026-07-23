import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { InvitationDto } from '@master-jdr/shared';

const API = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private readonly http = inject(HttpClient);
  // Story 21.1 : première introduction de ce signal (contrat AD-4, même forme que
  // CharacterService/HommeDragonService/PartiesService — compteur incrémenté, zéro information
  // de Partie/utilisateur à porter).
  private readonly _changed = signal(0);
  readonly changed = this._changed.asReadonly();
  notifyChanged(): void {
    this._changed.update((v) => v + 1);
  }

  /** Invitations PENDING reçues par l'utilisateur courant. */
  listReceived(): Promise<InvitationDto[]> {
    return firstValueFrom(
      this.http.get<InvitationDto[]>(`${API}/invitations`, { withCredentials: true }),
    );
  }

  accept(id: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${API}/invitations/${id}/accept`, {}, { withCredentials: true }),
    );
  }

  decline(id: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${API}/invitations/${id}/decline`, {}, { withCredentials: true }),
    );
  }
}
