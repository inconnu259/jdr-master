import { Injectable, inject } from '@angular/core';
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

const API = 'http://localhost:3000';

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

  list(role: 'mj' | 'player'): Promise<PartieDto[]> {
    return firstValueFrom(
      this.http.get<PartieDto[]>(`${API}/parties?role=${role}`, { withCredentials: true }),
    );
  }

  get(id: string): Promise<PartieDto> {
    return firstValueFrom(
      this.http.get<PartieDto>(`${API}/parties/${id}`, { withCredentials: true }),
    );
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

  // --- Membres & invitations (1c) ---

  searchUsers(q: string): Promise<UserSearchResultDto[]> {
    return firstValueFrom(
      this.http.get<UserSearchResultDto[]>(`${API}/users/search?q=${encodeURIComponent(q)}`, {
        withCredentials: true,
      }),
    );
  }

  members(id: string): Promise<PartieMemberDto[]> {
    return firstValueFrom(
      this.http.get<PartieMemberDto[]>(`${API}/parties/${id}/members`, { withCredentials: true }),
    );
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
