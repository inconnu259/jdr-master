import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CreateScenarioDto,
  LinkSeancePollDto,
  ScenarioDocumentDto,
  ScenarioDto,
  UpdateScenarioDto,
} from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class ScenariosService {
  private readonly http = inject(HttpClient);

  // Incrémenté après chaque mutation réussie (create/update/open) — permet aux composants qui
  // affichent une liste de scénarios chargée ailleurs (ex. ScenarioTimeline, chargée une fois dans
  // un onglet séparé de ScenarioDrafts/ScenarioForm) de savoir qu'ils doivent se recharger, sans
  // dépendre d'une navigation complète (F5) pour voir un changement fait dans un autre onglet.
  private readonly _changed = signal(0);
  readonly changed = this._changed.asReadonly();

  async create(partieId: string, dto: CreateScenarioDto): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.post<ScenarioDto>(`${API_BASE}/parties/${partieId}/scenarios`, dto, {
        withCredentials: true,
      }),
    );
    this._changed.update((v) => v + 1);
    return result;
  }

  async update(scenarioId: string, dto: UpdateScenarioDto): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.patch<ScenarioDto>(`${API_BASE}/scenarios/${scenarioId}`, dto, {
        withCredentials: true,
      }),
    );
    this._changed.update((v) => v + 1);
    return result;
  }

  listDrafts(partieId: string): Promise<ScenarioDto[]> {
    return firstValueFrom(
      this.http.get<ScenarioDto[]>(`${API_BASE}/parties/${partieId}/scenarios/drafts`, {
        withCredentials: true,
      }),
    );
  }

  listAll(partieId: string): Promise<ScenarioDto[]> {
    return firstValueFrom(
      this.http.get<ScenarioDto[]>(`${API_BASE}/parties/${partieId}/scenarios`, {
        withCredentials: true,
      }),
    );
  }

  async open(scenarioId: string): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.patch<ScenarioDto>(
        `${API_BASE}/scenarios/${scenarioId}/open`,
        {},
        { withCredentials: true },
      ),
    );
    this._changed.update((v) => v + 1);
    return result;
  }

  async markCourant(scenarioId: string): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.patch<ScenarioDto>(
        `${API_BASE}/scenarios/${scenarioId}/courant`,
        {},
        { withCredentials: true },
      ),
    );
    this._changed.update((v) => v + 1);
    return result;
  }

  async close(scenarioId: string): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.patch<ScenarioDto>(
        `${API_BASE}/scenarios/${scenarioId}/passe`,
        {},
        { withCredentials: true },
      ),
    );
    this._changed.update((v) => v + 1);
    return result;
  }

  async participate(scenarioId: string): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.post<ScenarioDto>(
        `${API_BASE}/scenarios/${scenarioId}/participate`,
        {},
        { withCredentials: true },
      ),
    );
    this._changed.update((v) => v + 1);
    return result;
  }

  async addSeance(scenarioId: string): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.post<ScenarioDto>(
        `${API_BASE}/scenarios/${scenarioId}/seances`,
        {},
        { withCredentials: true },
      ),
    );
    this._changed.update((v) => v + 1);
    return result;
  }

  async linkSeancePoll(seanceId: string, pollId: string): Promise<ScenarioDto> {
    const result = await firstValueFrom(
      this.http.patch<ScenarioDto>(
        `${API_BASE}/scenarios/seances/${seanceId}/poll`,
        { pollId } satisfies LinkSeancePollDto,
        { withCredentials: true },
      ),
    );
    this._changed.update((v) => v + 1);
    return result;
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
