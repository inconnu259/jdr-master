import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AuthUser } from '@master-jdr/shared';
import { API_BASE } from '../api-base';

// Source unique de l'URL d'API (`core/api-base.ts`) — l'URL était auparavant redéfinie en dur ici,
// ce qui cassait tout accès depuis un autre appareil que le poste de dev (la requête partait vers le
// `localhost` du téléphone). Le TODO « passer l'URL par la config d'environnement » reste ouvert et
// est suivi dans docs/backlog.md § Palier 10.
const API = API_BASE;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** Utilisateur courant (null = non connecté). */
  readonly currentUser = signal<AuthUser | null>(null);
  /** Passe à true une fois la session vérifiée au démarrage. */
  readonly initialized = signal(false);

  private sessionPromise: Promise<void> | null = null;

  /** Restaure la session via le cookie. Dédupliqué : un seul /auth/me même si appelé plusieurs fois. */
  loadSession(): Promise<void> {
    return (this.sessionPromise ??= this.fetchSession());
  }

  private async fetchSession(): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.http.get<AuthUser>(`${API}/auth/me`, { withCredentials: true }),
      );
      this.currentUser.set(user);
    } catch {
      this.currentUser.set(null);
    } finally {
      this.initialized.set(true);
    }
  }

  /** `identifier` accepte indifféremment l'email ou le pseudo (cf. LocalStrategy côté API). */
  async login(identifier: string, password: string): Promise<void> {
    const user = await firstValueFrom(
      this.http.post<AuthUser>(
        `${API}/auth/login`,
        { identifier, password },
        { withCredentials: true },
      ),
    );
    this.currentUser.set(user);
    this.initialized.set(true);
  }

  async register(email: string, pseudo: string, password: string, token: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${API}/auth/register`,
        { email, pseudo, password, token },
        { withCredentials: true },
      ),
    );
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/logout`, {}, { withCredentials: true }));
    this.currentUser.set(null);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API}/auth/forgot-password`, { email }, { withCredentials: true }),
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${API}/auth/reset-password`,
        { token, newPassword },
        { withCredentials: true },
      ),
    );
  }
}
