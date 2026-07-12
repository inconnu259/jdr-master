import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

@Component({
  selector: 'app-scenario-drafts',
  imports: [MatButtonModule],
  templateUrl: './scenario-drafts.html',
  styleUrl: './scenario-drafts.scss',
})
export class ScenarioDrafts implements OnInit {
  private readonly scenarios = inject(ScenariosService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Optionnel : rempli par le parent quand intégré directement dans un onglet (`PartieDetail`) ;
  // sinon repli sur le paramètre de route `:id`, quand ce composant est chargé via la route
  // `parties/:id/scenarios/drafts`.
  readonly partieId = input<string | undefined>(undefined);

  protected readonly drafts = signal<ScenarioDto[]>([]);
  protected readonly loadError = signal<string | null>(null);

  private resolvePartieId(): string | undefined {
    return this.partieId() ?? this.route.snapshot.paramMap.get('id') ?? undefined;
  }

  async ngOnInit(): Promise<void> {
    const partieId = this.resolvePartieId();
    if (!partieId) {
      this.loadError.set('Partie introuvable.');
      return;
    }
    try {
      this.drafts.set(await this.scenarios.listDrafts(partieId));
    } catch {
      this.loadError.set('Impossible de charger les brouillons. Réessayez.');
    }
  }

  protected newScenario(): void {
    void this.router.navigate(['/parties', this.resolvePartieId(), 'scenarios', 'new']);
  }

  protected openScenario(scenario: ScenarioDto): void {
    void this.router.navigate(
      ['/parties', this.resolvePartieId(), 'scenarios', scenario.id],
      { state: { scenario } },
    );
  }

  protected async openToPlayers(scenario: ScenarioDto, event: Event): Promise<void> {
    event.stopPropagation();
    await this.scenarios.open(scenario.id);
    this.drafts.update((list) => list.filter((s) => s.id !== scenario.id));
  }
}
