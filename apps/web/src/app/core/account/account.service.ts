import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AuthUser } from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);

  updateDisplayName(displayName: string): Promise<AuthUser> {
    return firstValueFrom(
      this.http.patch<AuthUser>(
        `${API_BASE}/me/display-name`,
        { displayName },
        { withCredentials: true },
      ),
    );
  }
}
