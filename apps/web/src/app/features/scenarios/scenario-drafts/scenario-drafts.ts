import {
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenariosService, matchesPartie } from '../../../core/scenarios/scenarios.service';
import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';

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
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  // Optionnel : rempli par le parent quand intégré directement dans un onglet (`PartieDetail`) ;
  // sinon repli sur le paramètre de route `:id`, quand ce composant est chargé via la route
  // `parties/:id/scenarios/drafts`.
  readonly partieId = input<string | undefined>(undefined);

  protected readonly drafts = signal<ScenarioDto[]>([]);
  protected readonly loadError = signal<string | null>(null);

  private loadGeneration = 0;
  private destroyed = false;

  private resolvePartieId(): string | undefined {
    return this.partieId() ?? this.route.snapshot.paramMap.get('id') ?? undefined;
  }

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
    });

    // Story 21.2 (AC1) : réagit au signal générique ScenariosService.changed (RealtimeService,
    // Story 19.1) — un co-MJ qui crée/publie/supprime un brouillon ailleurs doit être reflété ici
    // sans rechargement de page. Garde firstRun (même piège que ScenarioEditor/Dashboard, Stories
    // 19.2/21.1) : ScenariosService est providedIn: 'root', son _changed peut déjà porter une
    // valeur avant le montage — sans ce garde, la première exécution de cet effect() (déclenchée à
    // la CONSTRUCTION, avant ngOnInit()) provoquerait un refetch redondant.
    let firstRun = true;
    effect(() => {
      const change = this.scenarios.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      const partieId = untracked(() => this.resolvePartieId());
      if (!partieId || !matchesPartie(change, partieId)) return;
      untracked(() => void this.loadDrafts(partieId));
    });
  }

  private async loadDrafts(partieId: string): Promise<void> {
    const generation = ++this.loadGeneration;
    try {
      const drafts = await this.scenarios.listDrafts(partieId);
      if (this.destroyed || generation !== this.loadGeneration) return;
      this.drafts.set(drafts);
      this.loadError.set(null);
    } catch {
      if (this.destroyed || generation !== this.loadGeneration) return;
      this.loadError.set('Impossible de charger les brouillons. Réessayez.');
    }
  }

  async ngOnInit(): Promise<void> {
    const partieId = this.resolvePartieId();
    if (!partieId) {
      this.loadError.set('Partie introuvable.');
      return;
    }
    this.realtime.connect(partieTopic(partieId));
    this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(partieId)));
    await this.loadDrafts(partieId);
  }

  protected newScenario(): void {
    void this.router.navigate(['/parties', this.resolvePartieId(), 'scenarios', 'new']);
  }

  protected openScenario(scenario: ScenarioDto): void {
    void this.router.navigate(['/parties', this.resolvePartieId(), 'scenarios', scenario.id], {
      state: { scenario },
    });
  }

  protected async openToPlayers(scenario: ScenarioDto, event: Event): Promise<void> {
    event.stopPropagation();
    await this.scenarios.open(scenario.id);
    this.drafts.update((list) => list.filter((s) => s.id !== scenario.id));
  }
}
