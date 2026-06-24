import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { PartieDto, PartieKind } from '@master-jdr/shared';

const API = 'http://localhost:3000';

export interface PartiePayload {
  name: string;
  gameSystemId: string;
  kind: PartieKind;
  description?: string;
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
    return firstValueFrom(this.http.get<PartieDto>(`${API}/parties/${id}`, { withCredentials: true }));
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
    return firstValueFrom(this.http.delete<void>(`${API}/parties/${id}`, { withCredentials: true }));
  }
}
