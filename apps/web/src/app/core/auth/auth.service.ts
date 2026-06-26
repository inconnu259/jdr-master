import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AuthUser } from '@master-jdr/shared';

// TODO (palier déploiement) : passer l'URL de l'API par la config d'environnement.
const API = 'http://localhost:3000';

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

  async login(email: string, password: string): Promise<void> {
    const user = await firstValueFrom(
      this.http.post<AuthUser>(`${API}/auth/login`, { email, password }, { withCredentials: true }),
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
}
