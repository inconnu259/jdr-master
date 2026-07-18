import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenarioEditor } from '../scenario-editor/scenario-editor';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

@Component({
  selector: 'app-scenario-detail',
  imports: [ScenarioEditor, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './scenario-detail.html',
  styleUrl: './scenario-detail.scss',
})
export class ScenarioDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly scenarios = inject(ScenariosService);

  // Transmis par l'état de navigation quand disponible (ScenarioForm après création,
  // ScenarioDrafts/ScenarioTimeline au clic sur une ligne, qui l'ont déjà en mémoire) — évite un
  // aller-retour réseau dans le cas courant. `extras.state` n'est lisible que pendant la navigation
  // en cours, donc capturé ici en constructeur.
  private readonly navigationScenario = inject(Router).getCurrentNavigation()?.extras.state?.[
    'scenario'
  ] as ScenarioDto | undefined;

  protected readonly scenario = signal<ScenarioDto | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loading = signal(true);
  // Lu depuis le paramètre de route `:id` — disponible même en cas d'erreur (contrairement à
  // `scenario().partieId`), pour que le lien "Retour à la partie" fonctionne aussi sur cette branche.
  protected readonly partieId = this.route.snapshot.paramMap.get('id');

  async ngOnInit(): Promise<void> {
    const scenarioId = this.route.snapshot.paramMap.get('scenarioId');
    if (!scenarioId || !this.partieId) {
      this.loadError.set('Scénario introuvable — revenez à la liste des Brouillons.');
      this.loading.set(false);
      return;
    }

    if (this.navigationScenario && this.navigationScenario.id === scenarioId) {
      this.scenario.set(this.navigationScenario);
      this.loading.set(false);
      return;
    }

    // Accès direct par URL ou rechargement (F5) : l'état de navigation est perdu. On retrouve le
    // scénario via `GET /parties/:id/scenarios` (AD-6, jamais filtré par statut) plutôt que
    // d'échouer — cet endpoint n'existait pas encore quand cette page a été créée (Stories 7.1-7.3).
    try {
      const found = (await this.scenarios.listAll(this.partieId)).find((s) => s.id === scenarioId);
      if (!found) {
        this.loadError.set('Scénario introuvable — revenez à la liste des Brouillons.');
        return;
      }
      this.scenario.set(found);
    } catch {
      this.loadError.set('Impossible de charger le scénario. Réessayez.');
    } finally {
      this.loading.set(false);
    }
  }
}
