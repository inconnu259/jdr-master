import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { HealthStatus } from '@master-jdr/shared';

// TODO (palier déploiement) : passer l'URL de l'API par la config d'environnement.
const API_URL = 'http://localhost:3000';

@Component({
  selector: 'app-root',
  imports: [],
  template: `
    <main class="health">
      <h1>master-jdr</h1>
      <p class="subtitle">Palier 0 — socle technique</p>

      @if (health(); as h) {
        <div class="card" [class.ok]="h.status === 'ok'" [class.ko]="h.status !== 'ok'">
          <p>API : <strong>{{ h.status === 'ok' ? 'API OK' : 'API en erreur' }}</strong></p>
          <p>Base de données : <strong>{{ h.db === 'up' ? 'DB OK' : 'DB indisponible' }}</strong></p>
          <p class="ts">{{ h.timestamp }}</p>
        </div>
      } @else if (error()) {
        <div class="card ko">
          <p>API injoignable</p>
          <p class="ts">{{ error() }}</p>
        </div>
      } @else {
        <div class="card">Vérification en cours…</div>
      }
    </main>
  `,
  styles: `
    .health {
      font-family: system-ui, sans-serif;
      max-width: 32rem;
      margin: 4rem auto;
      text-align: center;
    }
    .subtitle { color: #666; margin-top: -0.5rem; }
    .card {
      margin-top: 2rem;
      padding: 1.5rem;
      border-radius: 0.75rem;
      border: 2px solid #ddd;
    }
    .card.ok { border-color: #2e7d32; background: #e8f5e9; }
    .card.ko { border-color: #c62828; background: #ffebee; }
    .ts { color: #888; font-size: 0.8rem; }
  `,
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly health = signal<HealthStatus | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.http.get<HealthStatus>(`${API_URL}/health`).subscribe({
      next: (h) => this.health.set(h),
      error: (e) => this.error.set(String(e?.message ?? e)),
    });
  }
}
