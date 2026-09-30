import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  ChooseArtefactCadeauDto,
  ChooseEveilPowerDto,
  CreateHommeDragonDto,
  HommeDragonDto,
  MyHommeDragonDto,
  UpdateHommeDragonDto,
} from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class HommeDragonService {
  private readonly http = inject(HttpClient);
  // Story 20.2 (AC2) : première introduction de ce signal (contrat AD-4, même forme que
  // CharacterService/PartiesService — compteur incrémenté, zéro information de Partie à porter).
  private readonly _changed = signal(0);
  readonly changed = this._changed.asReadonly();
  notifyChanged(): void {
    this._changed.update((v) => v + 1);
  }

  // Plusieurs composants montés simultanément peuvent recharger sur le même changed() (cf. bug
  // 429 en rafale sur ScenariosService.listAll, même correctif ici) — les appels concurrents pour
  // la même Partie partagent la même requête en vol.
  private readonly inFlightFindOne = new Map<string, Promise<HommeDragonDto | null>>();

  findOne(partieId: string): Promise<HommeDragonDto | null> {
    const existing = this.inFlightFindOne.get(partieId);
    if (existing) return existing;
    const request = firstValueFrom(
      this.http.get<HommeDragonDto | null>(`${API_BASE}/parties/${partieId}/homme-dragon`, {
        withCredentials: true,
      }),
    ).finally(() => this.inFlightFindOne.delete(partieId));
    this.inFlightFindOne.set(partieId, request);
    return request;
  }

  /** Mes Hommes Dragons pour « Personnages » (Story 33.5) — une seule lecture agrégée, jamais une
   *  requête par partie. Tableau : on ne suppose pas « un par partie » (Story 33.8). */
  listMine(): Promise<MyHommeDragonDto[]> {
    return firstValueFrom(
      this.http.get<MyHommeDragonDto[]>(`${API_BASE}/me/homme-dragons`, {
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

  /** Choix unique et définitif de l'artefact cadeau du niveau 4 (Story 33.7). */
  chooseArtefactCadeau(partieId: string, dto: ChooseArtefactCadeauDto): Promise<HommeDragonDto> {
    return firstValueFrom(
      this.http.post<HommeDragonDto>(
        `${API_BASE}/parties/${partieId}/homme-dragon/artefact-cadeau`,
        dto,
        { withCredentials: true },
      ),
    );
  }

  exportPdf(partieId: string, format: 'editable' | '2pages'): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE}/parties/${partieId}/homme-dragon/export.pdf`, {
        params: { format },
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }
}
