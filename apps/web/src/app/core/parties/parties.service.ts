import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CreateXpDistributionDto,
  InviteLinkDto,
  PartieDto,
  PartieKind,
  PartieMemberDto,
  UserSearchResultDto,
  XpDistributionDto,
} from '@master-jdr/shared';
import { API_BASE } from '../api-base';

// `API_BASE` (importé ci-dessus) était masqué par une redéfinition en dur — corrigé pour que l'app
// reste fonctionnelle depuis un autre appareil que le poste de dev (cf. core/api-base.ts).
const API = API_BASE;

export interface PartiePayload {
  name: string;
  gameSystemId: string;
  kind: PartieKind;
  description?: string;
}

export interface InviteLinkPayload {
  maxUses?: number;
  expiresAt?: string;
}

@Injectable({ providedIn: 'root' })
export class PartiesService {
  private readonly http = inject(HttpClient);

  // AD-4 : contrat public générique, zéro argument. Compteur simple (pas de scoping par
  // partieId comme ScenariosService/Story 17.3) — inutile ici : RealtimeService ne notifie ce
  // service que pour le topic `partie:{id}` sur lequel PartieDetail s'est explicitement
  // connecté (Story 18.2, un seul PartieDetail monté à la fois par instance d'app), donc tout
  // appel de notifyChanged() concerne nécessairement LA Partie actuellement affichée.
  private readonly _changed = signal(0);
  readonly changed = this._changed.asReadonly();
  notifyChanged(): void {
    this._changed.update((v) => v + 1);
  }

  list(role: 'mj' | 'player'): Promise<PartieDto[]> {
    return firstValueFrom(
      this.http.get<PartieDto[]>(`${API}/parties?role=${role}`, { withCredentials: true }),
    );
  }

  // Plusieurs composants montés simultanément peuvent recharger sur le même changed() (cf. bug
  // 429 en rafale sur ScenariosService.listAll, même correctif ici) — les appels concurrents pour
  // la même clé partagent la même requête en vol.
  private readonly inFlightGet = new Map<string, Promise<PartieDto>>();
  private readonly inFlightMembers = new Map<string, Promise<PartieMemberDto[]>>();

  get(id: string): Promise<PartieDto> {
    const existing = this.inFlightGet.get(id);
    if (existing) return existing;
    const request = firstValueFrom(
      this.http.get<PartieDto>(`${API}/parties/${id}`, { withCredentials: true }),
    ).finally(() => this.inFlightGet.delete(id));
    this.inFlightGet.set(id, request);
    return request;
  }

  create(payload: PartiePayload): Promise<PartieDto> {
    return firstValueFrom(
      this.http.post<PartieDto>(`${API}/parties`, payload, { withCredentials: true }),
    );
  }

  update(id: string, payload: Partial<PartiePayload>): Promise<PartieDto> {
    return firstValueFrom(
      this.http.patch<PartieDto>(`${API}/parties/${id}`, payload, { withCredentials: true }),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API}/parties/${id}`, { withCredentials: true }),
    );
  }

  /** Dépose l'image de couverture (Story 29.12, AC1) — recadrage centré automatique côté serveur,
   *  aucune donnée de recadrage à transmettre (contrairement au portrait de personnage). */
  setCoverImage(id: string, file: File): Promise<PartieDto> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(
      this.http.put<PartieDto>(`${API}/parties/${id}/cover`, form, { withCredentials: true }),
    );
  }

  /** Retire l'image de couverture (AC3) — la bannière générée reprend sa place. */
  removeCoverImage(id: string): Promise<PartieDto> {
    return firstValueFrom(
      this.http.delete<PartieDto>(`${API}/parties/${id}/cover`, { withCredentials: true }),
    );
  }

  close(id: string): Promise<PartieDto> {
    return firstValueFrom(
      this.http.patch<PartieDto>(`${API}/parties/${id}/close`, {}, { withCredentials: true }),
    );
  }

  reopen(id: string): Promise<PartieDto> {
    return firstValueFrom(
      this.http.patch<PartieDto>(`${API}/parties/${id}/reopen`, {}, { withCredentials: true }),
    );
  }

  // --- Membres & invitations (1c) ---

  searchUsers(q: string): Promise<UserSearchResultDto[]> {
    return firstValueFrom(
      this.http.get<UserSearchResultDto[]>(`${API}/users/search?q=${encodeURIComponent(q)}`, {
        withCredentials: true,
      }),
    );
  }

  members(id: string): Promise<PartieMemberDto[]> {
    const existing = this.inFlightMembers.get(id);
    if (existing) return existing;
    const request = firstValueFrom(
      this.http.get<PartieMemberDto[]>(`${API}/parties/${id}/members`, { withCredentials: true }),
    ).finally(() => this.inFlightMembers.delete(id));
    this.inFlightMembers.set(id, request);
    return request;
  }

  removeMember(id: string, userId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API}/parties/${id}/members/${userId}`, { withCredentials: true }),
    );
  }

  inviteUser(id: string, inviteeUserId: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(
        `${API}/parties/${id}/invitations`,
        { inviteeUserId },
        { withCredentials: true },
      ),
    );
  }

  inviteByEmail(id: string, email: string): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `${API}/parties/${id}/invitations/by-email`,
        { email },
        { withCredentials: true },
      ),
    );
  }

  inviteLinks(id: string): Promise<InviteLinkDto[]> {
    return firstValueFrom(
      this.http.get<InviteLinkDto[]>(`${API}/parties/${id}/invite-links`, {
        withCredentials: true,
      }),
    );
  }

  createInviteLink(id: string, payload: InviteLinkPayload): Promise<InviteLinkDto> {
    return firstValueFrom(
      this.http.post<InviteLinkDto>(`${API}/parties/${id}/invite-links`, payload, {
        withCredentials: true,
      }),
    );
  }

  revokeInviteLink(linkId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API}/invite-links/${linkId}`, { withCredentials: true }),
    );
  }

  // --- Distribution d'XP (Story 6.2) ---

  createXpDistribution(id: string, payload: CreateXpDistributionDto): Promise<XpDistributionDto> {
    return firstValueFrom(
      this.http.post<XpDistributionDto>(`${API_BASE}/parties/${id}/xp-distributions`, payload, {
        withCredentials: true,
      }),
    );
  }

  listXpDistributions(id: string): Promise<XpDistributionDto[]> {
    return firstValueFrom(
      this.http.get<XpDistributionDto[]>(`${API_BASE}/parties/${id}/xp-distributions`, {
        withCredentials: true,
      }),
    );
  }
}
