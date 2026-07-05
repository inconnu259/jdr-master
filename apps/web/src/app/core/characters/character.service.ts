import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CharacterDto,
  CreateCharacterDto,
  GameSystemContentDto,
  GameSystemDto,
  GameSystemSchemaDto,
} from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly http = inject(HttpClient);

  getGameSystems(): Promise<GameSystemDto[]> {
    return firstValueFrom(
      this.http.get<GameSystemDto[]>(`${API_BASE}/game-systems`, { withCredentials: true }),
    );
  }

  getGameSystemSchema(id: string): Promise<GameSystemSchemaDto> {
    return firstValueFrom(
      this.http.get<GameSystemSchemaDto>(`${API_BASE}/game-systems/${id}/schema`, {
        withCredentials: true,
      }),
    );
  }

  getGameSystemContent(id: string): Promise<GameSystemContentDto> {
    return firstValueFrom(
      this.http.get<GameSystemContentDto>(`${API_BASE}/game-systems/${id}/content`, {
        withCredentials: true,
      }),
    );
  }

  create(partieId: string, dto: CreateCharacterDto): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.post<CharacterDto>(`${API_BASE}/parties/${partieId}/characters`, dto, {
        withCredentials: true,
      }),
    );
  }

  listByPartie(partieId: string): Promise<CharacterDto[]> {
    return firstValueFrom(
      this.http.get<CharacterDto[]>(`${API_BASE}/parties/${partieId}/characters`, {
        withCredentials: true,
      }),
    );
  }

  get(id: string): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.get<CharacterDto>(`${API_BASE}/characters/${id}`, { withCredentials: true }),
    );
  }

  exportPdf(id: string, format: 'editable' | '2pages'): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE}/characters/${id}/export.pdf`, {
        params: { format },
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }

  updatePortrait(
    id: string,
    file: File,
    cropData: { scale: number; offsetX: number; offsetY: number } | null,
  ): Promise<CharacterDto> {
    const form = new FormData();
    form.append('file', file);
    if (cropData) form.append('cropData', JSON.stringify(cropData));
    return firstValueFrom(
      this.http.put<CharacterDto>(`${API_BASE}/characters/${id}/portrait`, form, {
        withCredentials: true,
      }),
    );
  }

  removePortrait(id: string): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.delete<CharacterDto>(`${API_BASE}/characters/${id}/portrait`, {
        withCredentials: true,
      }),
    );
  }

  /** Récupère les octets du portrait existant (utilisé par `PortraitCropper` pour permettre un réajustement du recadrage sans re-sélection de fichier, AC4). */
  getPortraitBlob(id: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE}/characters/${id}/portrait`, {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }
}
