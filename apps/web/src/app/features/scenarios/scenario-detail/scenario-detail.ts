import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioEditor } from '../scenario-editor/scenario-editor';

@Component({
  selector: 'app-scenario-detail',
  imports: [ScenarioEditor],
  templateUrl: './scenario-detail.html',
  styleUrl: './scenario-detail.scss',
})
export class ScenarioDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);

  // Aucun endpoint `GET /scenarios/:id` n'existe (Stories 7.1-7.3) : le scénario complet est
  // transmis via l'état de navigation par les deux seuls points d'entrée possibles (ScenarioForm
  // après création, ScenarioDrafts au clic sur une ligne), qui l'ont déjà en mémoire. `extras.state`
  // n'est lisible que pendant la navigation en cours, donc capturé ici en constructeur.
  private readonly navigationScenario = inject(Router).getCurrentNavigation()?.extras.state?.[
    'scenario'
  ] as ScenarioDto | undefined;

  protected readonly scenario = signal<ScenarioDto | null>(null);
  protected readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    const scenarioId = this.route.snapshot.paramMap.get('scenarioId');
    if (!scenarioId || !this.navigationScenario || this.navigationScenario.id !== scenarioId) {
      this.loadError.set(
        'Scénario indisponible directement par URL — revenez à la liste des Brouillons.',
      );
      return;
    }
    this.scenario.set(this.navigationScenario);
  }
}
