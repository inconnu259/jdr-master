import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ScenarioEditor } from '../scenario-editor/scenario-editor';

/**
 * Un ONE_SHOT n'a jamais qu'un seul scénario (auto-créé à la création de la Partie, AD-7) : pas de
 * liste, pas de "+ Nouveau" (le backend rejette toute création supplémentaire). Tant qu'il reste
 * `BROUILLON`, on le trouve via `listDrafts()`. Une fois ouvert aux joueurs (`open()`) ou passé
 * `COURANT`/`PASSE`, il ne remonte plus dans `listDrafts()` : on retombe alors sur `listAll()`
 * (`GET /parties/:id/scenarios`, ajouté par la Story 7.5) qui retourne tous les statuts — ce tab
 * n'affiche pas d'onglet Chronologie séparé (réservé aux campagnes), donc c'est lui qui doit gérer
 * les deux statuts.
 */
@Component({
  selector: 'app-scenario-one-shot-tab',
  imports: [MatButtonModule, ScenarioEditor],
  templateUrl: './scenario-one-shot-tab.html',
  styleUrl: './scenario-one-shot-tab.scss',
})
export class ScenarioOneShotTab implements OnInit {
  private readonly scenarios = inject(ScenariosService);

  readonly partieId = input.required<string>();

  protected readonly scenario = signal<ScenarioDto | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly openError = signal<string | null>(null);
  protected readonly opening = signal(false);
  protected readonly notFound = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const drafts = await this.scenarios.listDrafts(this.partieId());
      if (drafts.length > 0) {
        this.scenario.set(drafts[0]);
        return;
      }
      const all = await this.scenarios.listAll(this.partieId());
      if (all.length === 0) {
        this.notFound.set(true);
        return;
      }
      this.scenario.set(all[0]);
    } catch {
      this.loadError.set('Impossible de charger le scénario. Réessayez.');
    }
  }

  protected async openToPlayers(): Promise<void> {
    const s = this.scenario();
    if (!s || this.opening()) return;
    this.opening.set(true);
    this.openError.set(null);
    try {
      this.scenario.set(await this.scenarios.open(s.id));
    } catch {
      this.openError.set("Impossible d'ouvrir le scénario aux joueurs. Réessayez.");
    } finally {
      this.opening.set(false);
    }
  }
}
