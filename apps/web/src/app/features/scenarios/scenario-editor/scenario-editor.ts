import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { ScenarioDocumentDto, ScenarioDto, UpdateScenarioDto } from '@master-jdr/shared';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { FieldEditPencil } from '../../characters/character-sheet/field-edit-pencil/field-edit-pencil';
import { ScenarioStatusBadge } from '../scenario-status-badge/scenario-status-badge';

type ScenarioTextField = keyof UpdateScenarioDto;

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse && typeof err.error?.message === 'string') {
    return err.error.message;
  }
  return fallback;
}

/**
 * Édition + documents d'un scénario — extrait de `ScenarioDetail` pour être réutilisable à la fois
 * par la page routée (campagne, scénario reçu via l'état de navigation) et par l'onglet ONE_SHOT
 * (scénario reçu directement de `listDrafts()`, sans navigation). Reçoit le `ScenarioDto` en input
 * plutôt que de le résoudre lui-même.
 */
@Component({
  selector: 'app-scenario-editor',
  imports: [MatButtonModule, MatIconModule, FieldEditPencil, ScenarioStatusBadge],
  templateUrl: './scenario-editor.html',
  styleUrl: './scenario-editor.scss',
})
export class ScenarioEditor implements OnInit {
  private readonly scenarios = inject(ScenariosService);

  readonly scenarioInput = input.required<ScenarioDto>({ alias: 'scenario' });

  protected readonly scenario = signal<ScenarioDto | null>(null);
  protected readonly documents = signal<ScenarioDocumentDto[]>([]);
  protected readonly documentsError = signal<string | null>(null);

  protected readonly isReadOnly = computed(() => this.scenario()?.status === 'PASSE');

  protected readonly ownDocuments = computed(() =>
    this.documents().filter((d) => d.scenarioId !== null),
  );
  protected readonly libraryDocuments = computed(() =>
    this.documents().filter((d) => d.scenarioId === null),
  );

  protected readonly descriptionDraft = signal('');
  protected readonly fieldEditError = signal<string | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly markCourantError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const s = this.scenarioInput();
      this.scenario.set(s);
      this.descriptionDraft.set(s.description ?? '');
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.documents.set(await this.scenarios.listDocuments(this.scenarioInput().id));
    } catch {
      this.documentsError.set('Impossible de charger les documents. Réessayez.');
    }
  }

  protected async onFieldConfirm(field: ScenarioTextField, value: string | number): Promise<void> {
    const s = this.scenario();
    if (!s || this.isReadOnly()) return;
    this.fieldEditError.set(null);
    try {
      this.scenario.set(await this.scenarios.update(s.id, { [field]: value }));
    } catch (err) {
      this.fieldEditError.set(extractErrorMessage(err, 'Impossible d’enregistrer la modification.'));
    }
  }

  protected async submitDescription(): Promise<void> {
    const s = this.scenario();
    if (!s || this.isReadOnly()) return;
    this.fieldEditError.set(null);
    try {
      this.scenario.set(
        await this.scenarios.update(s.id, { description: this.descriptionDraft() }),
      );
    } catch (err) {
      this.fieldEditError.set(extractErrorMessage(err, 'Impossible d’enregistrer la modification.'));
    }
  }

  protected async onScenarioFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.isReadOnly()) return;
    const s = this.scenario();
    if (!s) return;
    await this.upload(file, s.partieId, s.id);
  }

  protected async onLibraryFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const s = this.scenario();
    if (!s) return;
    await this.upload(file, s.partieId, undefined);
  }

  private async upload(file: File, partieId: string, scenarioId: string | undefined): Promise<void> {
    this.uploadError.set(null);
    try {
      await this.scenarios.uploadDocument(partieId, file, scenarioId);
      const s = this.scenario();
      if (s) this.documents.set(await this.scenarios.listDocuments(s.id));
    } catch (err) {
      this.uploadError.set(extractErrorMessage(err, "Impossible d'envoyer le document. Réessayez."));
    }
  }

  protected async markCourant(): Promise<void> {
    const s = this.scenario();
    if (!s || s.status !== 'A_VENIR') return;
    this.markCourantError.set(null);
    try {
      this.scenario.set(await this.scenarios.markCourant(s.id));
    } catch (err) {
      this.markCourantError.set(
        extractErrorMessage(err, 'Impossible de marquer ce scénario comme Courant.'),
      );
    }
  }

  protected async downloadDocument(doc: ScenarioDocumentDto): Promise<void> {
    this.downloadError.set(null);
    try {
      const blob = await this.scenarios.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      this.downloadError.set(extractErrorMessage(err, 'Impossible de télécharger le document.'));
    }
  }
}
