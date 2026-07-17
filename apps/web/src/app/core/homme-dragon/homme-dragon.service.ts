import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  ChooseEveilPowerDto,
  CreateHommeDragonDto,
  HommeDragonDto,
  UpdateHommeDragonDto,
} from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class HommeDragonService {
  private readonly http = inject(HttpClient);

  findOne(partieId: string): Promise<HommeDragonDto | null> {
    return firstValueFrom(
      this.http.get<HommeDragonDto | null>(`${API_BASE}/parties/${partieId}/homme-dragon`, {
        withCredentials: true,
      }),
    );
  }

  create(partieId: string, dto: CreateHommeDragonDto): Promise<HommeDragonDto> {
    return firstValueFrom(
      this.http.post<HommeDragonDto>(`${API_BASE}/parties/${partieId}/homme-dragon`, dto, {
        withCredentials: true,
      }),
    );
  }

  update(partieId: string, dto: UpdateHommeDragonDto): Promise<HommeDragonDto> {
    return firstValueFrom(
      this.http.patch<HommeDragonDto>(`${API_BASE}/parties/${partieId}/homme-dragon`, dto, {
        withCredentials: true,
      }),
    );
  }

  chooseEveilPower(partieId: string, dto: ChooseEveilPowerDto): Promise<HommeDragonDto> {
    return firstValueFrom(
      this.http.post<HommeDragonDto>(
        `${API_BASE}/parties/${partieId}/homme-dragon/eveil-power`,
        dto,
        { withCredentials: true },
      ),
    );
  }

  exportPdf(partieId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE}/parties/${partieId}/homme-dragon/export.pdf`, {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }
}
