import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AvailabilityDeclarationDto, CreateAvailabilityDto } from '@master-jdr/shared';
import { API_BASE } from '../api-base';

const API = API_BASE;

@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly http = inject(HttpClient);

  getMyDeclarations(): Promise<AvailabilityDeclarationDto[]> {
    return firstValueFrom(
      this.http.get<AvailabilityDeclarationDto[]>(`${API}/availability`, { withCredentials: true }),
    );
  }

  createDeclaration(dto: CreateAvailabilityDto): Promise<AvailabilityDeclarationDto> {
    return firstValueFrom(
      this.http.post<AvailabilityDeclarationDto>(`${API}/availability`, dto, { withCredentials: true }),
    );
  }

  deleteDeclaration(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API}/availability/${id}`, { withCredentials: true }),
    );
  }
}
