import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AuthUser, Theme } from '@master-jdr/shared';
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

  /** N'applique jamais le thème (AD-13) — lit/écrit uniquement la préférence côté compte. */
  setTheme(theme: Theme): Promise<AuthUser> {
    return firstValueFrom(
      this.http.patch<AuthUser>(
        `${API_BASE}/me/theme`,
        { theme },
        { withCredentials: true },
      ),
    );
  }

  changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.patch<{ ok: true }>(
        `${API_BASE}/me/password`,
        { currentPassword, newPassword },
        { withCredentials: true },
      ),
    );
  }
}
