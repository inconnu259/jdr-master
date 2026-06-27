import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { InviteLinkPreviewDto } from '@master-jdr/shared';

const API = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class JoinService {
  private readonly http = inject(HttpClient);

  /** Prévisualisation publique d'un lien (pas besoin de session). */
  preview(token: string): Promise<InviteLinkPreviewDto> {
    return firstValueFrom(this.http.get<InviteLinkPreviewDto>(`${API}/invite-links/${token}`));
  }

  /** Rejoindre la partie via le lien (utilisateur connecté). Renvoie l'id de la partie. */
  join(token: string): Promise<{ ok: boolean; partieId: string }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; partieId: string }>(
        `${API}/invite-links/${token}/join`,
        {},
        { withCredentials: true },
      ),
    );
  }
}
