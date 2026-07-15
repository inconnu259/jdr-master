import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AnnouncementDto, CreateAnnouncementDto } from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly http = inject(HttpClient);

  create(partieId: string, dto: CreateAnnouncementDto): Promise<AnnouncementDto> {
    return firstValueFrom(
      this.http.post<AnnouncementDto>(`${API_BASE}/parties/${partieId}/announcements`, dto, {
        withCredentials: true,
      }),
    );
  }
}
