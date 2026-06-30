import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AggregatedSlotDto, AvailableSlotDto, CreatePollDto, SessionPollDto } from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class PollService {
  private readonly http = inject(HttpClient);

  getAvailableSlots(partieId: string, weeks?: number, from?: string, to?: string): Promise<(AvailableSlotDto | AggregatedSlotDto)[]> {
    let url: string;
    if (from && to) {
      url = `${API_BASE}/parties/${partieId}/available-slots?from=${from}&to=${to}`;
    } else if (weeks !== undefined) {
      url = `${API_BASE}/parties/${partieId}/available-slots?weeks=${weeks}`;
    } else {
      url = `${API_BASE}/parties/${partieId}/available-slots`;
    }
    return firstValueFrom(this.http.get<(AvailableSlotDto | AggregatedSlotDto)[]>(url, { withCredentials: true }));
  }

  getHeatmap(partieId: string, from: string, to: string): Promise<AggregatedSlotDto[]> {
    return firstValueFrom(
      this.http.get<AggregatedSlotDto[]>(
        `${API_BASE}/parties/${partieId}/heatmap?from=${from}&to=${to}`,
        { withCredentials: true },
      ),
    );
  }

  createPoll(partieId: string, dto: CreatePollDto): Promise<SessionPollDto> {
    return firstValueFrom(
      this.http.post<SessionPollDto>(
        `${API_BASE}/parties/${partieId}/poll`,
        dto,
        { withCredentials: true },
      ),
    );
  }

  getCurrentPoll(partieId: string): Promise<SessionPollDto | null> {
    return firstValueFrom(
      this.http.get<SessionPollDto | null>(
        `${API_BASE}/parties/${partieId}/poll`,
        { withCredentials: true },
      ),
    );
  }

  closePoll(partieId: string, pollId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `${API_BASE}/parties/${partieId}/poll/${pollId}`,
        { withCredentials: true },
      ),
    );
  }
}
