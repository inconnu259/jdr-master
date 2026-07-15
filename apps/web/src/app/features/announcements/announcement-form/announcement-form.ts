import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import type { AnnouncementDto, ScenarioDto } from '@master-jdr/shared';
import { AnnouncementsService } from '../../../core/announcements/announcements.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

@Component({
  selector: 'app-announcement-form',
  standalone: true,
  imports: [FormsModule, MatButtonModule],
  templateUrl: './announcement-form.html',
})
export class AnnouncementFormComponent implements OnInit {
  readonly partieId = input.required<string>();
  readonly published = output<AnnouncementDto>();

  private readonly scenariosSvc = inject(ScenariosService);
  private readonly announcementsSvc = inject(AnnouncementsService);
  protected readonly theme = inject(ThemeToneService);

  protected readonly scenarios = signal<ScenarioDto[]>([]);
  // AC4/AD-6 : filtrage frontend uniquement — jamais BROUILLON/A_VENIR dans le sélecteur (annoncer
  // quelque chose de scopé à un contenu pas encore révélé fuiterait indirectement son existence).
  protected readonly eligibleScenarios = computed(() =>
    this.scenarios().filter((s) => s.status === 'COURANT' || s.status === 'PASSE'),
  );

  protected readonly text = signal('');
  protected readonly selectedScenarioId = signal<string | null>(null);
  protected readonly isValid = computed(() => this.text().trim().length > 0);
  protected readonly publishing = signal(false);
  protected readonly justPublished = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadScenarios();
  }

  // Revue de code : sans catch, un échec de listAll() (ex. panne réseau) laissait une promesse
  // rejetée non gérée et le sélecteur silencieusement vide, sans retour utilisateur.
  private async loadScenarios(): Promise<void> {
    try {
      this.scenarios.set(await this.scenariosSvc.listAll(this.partieId()));
    } catch {
      this.error.set('Impossible de charger les scénarios. Réessayez.');
    }
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isValid() || this.publishing()) return;
    this.publishing.set(true);
    this.justPublished.set(false);
    this.error.set(null);
    try {
      const created = await this.announcementsSvc.create(this.partieId(), {
        text: this.text().trim(),
        scenarioId: this.selectedScenarioId() ?? undefined,
      });
      this.text.set('');
      this.selectedScenarioId.set(null);
      this.justPublished.set(true);
      this.published.emit(created);
    } catch {
      // Revue de code : un échec de create() (ex. 400 backend, panne réseau) laissait une promesse
      // rejetée non gérée, sans retour utilisateur — le texte/la sélection sont volontairement
      // conservés (pas de reset) pour permettre une nouvelle tentative sans ressaisie.
      this.error.set('Impossible de publier l’annonce. Réessayez.');
    } finally {
      this.publishing.set(false);
    }
  }
}
