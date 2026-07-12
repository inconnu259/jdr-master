import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CreateScenarioDto,
  ScenarioDocumentDto,
  ScenarioDto,
  UpdateScenarioDto,
} from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class ScenariosService {
  private readonly http = inject(HttpClient);

  create(partieId: string, dto: CreateScenarioDto): Promise<ScenarioDto> {
    return firstValueFrom(
      this.http.post<ScenarioDto>(`${API_BASE}/parties/${partieId}/scenarios`, dto, {
        withCredentials: true,
      }),
    );
  }

  update(scenarioId: string, dto: UpdateScenarioDto): Promise<ScenarioDto> {
    return firstValueFrom(
      this.http.patch<ScenarioDto>(`${API_BASE}/scenarios/${scenarioId}`, dto, {
        withCredentials: true,
      }),
    );
  }

  listDrafts(partieId: string): Promise<ScenarioDto[]> {
    return firstValueFrom(
      this.http.get<ScenarioDto[]>(`${API_BASE}/parties/${partieId}/scenarios/drafts`, {
        withCredentials: true,
      }),
    );
  }

  open(scenarioId: string): Promise<ScenarioDto> {
    return firstValueFrom(
      this.http.patch<ScenarioDto>(
        `${API_BASE}/scenarios/${scenarioId}/open`,
        {},
        { withCredentials: true },
      ),
    );
  }

  uploadDocument(
    partieId: string,
    file: File,
    scenarioId?: string,
  ): Promise<ScenarioDocumentDto> {
    const form = new FormData();
    form.append('file', file);
    if (scenarioId) form.append('scenarioId', scenarioId);
    return firstValueFrom(
      this.http.post<ScenarioDocumentDto>(`${API_BASE}/parties/${partieId}/documents`, form, {
        withCredentials: true,
      }),
    );
  }

  listDocuments(scenarioId: string): Promise<ScenarioDocumentDto[]> {
    return firstValueFrom(
      this.http.get<ScenarioDocumentDto[]>(`${API_BASE}/scenarios/${scenarioId}/documents`, {
        withCredentials: true,
      }),
    );
  }

  listLibraryDocuments(partieId: string): Promise<ScenarioDocumentDto[]> {
    return firstValueFrom(
      this.http.get<ScenarioDocumentDto[]>(`${API_BASE}/parties/${partieId}/documents`, {
        withCredentials: true,
      }),
    );
  }

  downloadDocument(documentId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE}/documents/${documentId}`, {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }
}
