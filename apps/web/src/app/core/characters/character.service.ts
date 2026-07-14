import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CharacterDto,
  CharacterNoteDto,
  CharacterSnapshotDto,
  CreateCharacterDto,
  CreateCharacterNoteDto,
  CreateInventoryItemDto,
  CreateLevelUpDto,
  GameSystemContentDto,
  GameSystemDto,
  GameSystemSchemaDto,
  SetJournalAutoAssociateDto,
  SetNoteScenarioDto,
  SetSheetFieldResultDto,
  UpdateInventoryItemDto,
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

  /** Enregistre le recadrage dédié à l'export PDF — pas de fichier, l'image source existe déjà. */
  patchPdfPortraitCrop(
    id: string,
    cropData: { scale: number; offsetX: number; offsetY: number },
  ): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.patch<CharacterDto>(`${API_BASE}/characters/${id}/pdf-portrait-crop`, cropData, {
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

  levelUp(id: string, dto: CreateLevelUpDto): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.post<CharacterDto>(`${API_BASE}/characters/${id}/level-up`, dto, {
        withCredentials: true,
      }),
    );
  }

  getHistory(id: string): Promise<CharacterSnapshotDto[]> {
    return firstValueFrom(
      this.http.get<CharacterSnapshotDto[]>(`${API_BASE}/characters/${id}/history`, {
        withCredentials: true,
      }),
    );
  }

  addInventoryItem(id: string, dto: CreateInventoryItemDto): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.post<CharacterDto>(`${API_BASE}/characters/${id}/inventory-items`, dto, {
        withCredentials: true,
      }),
    );
  }

  updateInventoryItem(
    id: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.patch<CharacterDto>(`${API_BASE}/characters/${id}/inventory-items/${itemId}`, dto, {
        withCredentials: true,
      }),
    );
  }

  removeInventoryItem(id: string, itemId: string): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.delete<CharacterDto>(`${API_BASE}/characters/${id}/inventory-items/${itemId}`, {
        withCredentials: true,
      }),
    );
  }

  addNote(id: string, dto: CreateCharacterNoteDto): Promise<CharacterNoteDto> {
    return firstValueFrom(
      this.http.post<CharacterNoteDto>(`${API_BASE}/characters/${id}/notes`, dto, {
        withCredentials: true,
      }),
    );
  }

  toggleNoteShare(id: string, noteId: string, shared: boolean): Promise<CharacterNoteDto> {
    return firstValueFrom(
      this.http.patch<CharacterNoteDto>(
        `${API_BASE}/characters/${id}/notes/${noteId}/share`,
        { shared },
        { withCredentials: true },
      ),
    );
  }

  setJournalAutoAssociate(id: string, value: boolean): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.patch<CharacterDto>(
        `${API_BASE}/characters/${id}/journal-auto-associate`,
        { journalAutoAssociate: value } satisfies SetJournalAutoAssociateDto,
        { withCredentials: true },
      ),
    );
  }

  setNoteScenario(
    id: string,
    noteId: string,
    scenarioId: string | null,
  ): Promise<CharacterNoteDto> {
    return firstValueFrom(
      this.http.patch<CharacterNoteDto>(
        `${API_BASE}/characters/${id}/notes/${noteId}/scenario`,
        { scenarioId } satisfies SetNoteScenarioDto,
        { withCredentials: true },
      ),
    );
  }

  getNotes(id: string): Promise<CharacterNoteDto[]> {
    return firstValueFrom(
      this.http.get<CharacterNoteDto[]>(`${API_BASE}/characters/${id}/notes`, {
        withCredentials: true,
      }),
    );
  }

  setXp(id: string, value: number): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.patch<CharacterDto>(
        `${API_BASE}/characters/${id}/xp`,
        { value },
        { withCredentials: true },
      ),
    );
  }

  setSheetField(id: string, path: string, value: unknown): Promise<SetSheetFieldResultDto> {
    return firstValueFrom(
      this.http.patch<SetSheetFieldResultDto>(
        `${API_BASE}/characters/${id}/sheet-field`,
        { path, value },
        { withCredentials: true },
      ),
    );
  }

  updateNarrativeField(id: string, field: string, value: unknown): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.patch<CharacterDto>(
        `${API_BASE}/characters/${id}/narrative-field`,
        { field, value },
        { withCredentials: true },
      ),
    );
  }
}
