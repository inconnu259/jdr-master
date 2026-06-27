import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { InvitationDto } from '@master-jdr/shared';

const API = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private readonly http = inject(HttpClient);

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
