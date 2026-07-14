import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type {
  CharacterDto,
  PartieMemberDto,
  ScenarioDocumentDto,
  ScenarioDto,
  UpdateScenarioDto,
} from '@master-jdr/shared';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { CharacterService } from '../../../core/characters/character.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { FieldEditPencil } from '../../characters/character-sheet/field-edit-pencil/field-edit-pencil';
import { CharacterSummaryCard } from '../../characters/character-summary-card/character-summary-card';
import { ScenarioStatusBadge } from '../scenario-status-badge/scenario-status-badge';
import { SeanceList } from '../seance-list/seance-list';

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
  imports: [
    MatButtonModule,
    MatIconModule,
    FieldEditPencil,
    ScenarioStatusBadge,
    CharacterSummaryCard,
    SeanceList,
  ],
  templateUrl: './scenario-editor.html',
  styleUrl: './scenario-editor.scss',
})
export class ScenarioEditor implements OnInit {
  private readonly scenarios = inject(ScenariosService);
  private readonly characterService = inject(CharacterService);
  private readonly partiesService = inject(PartiesService);

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
  protected readonly resumeFinDraft = signal('');
  protected readonly resumeFinError = signal<string | null>(null);
  protected readonly fieldEditError = signal<string | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly markCourantError = signal<string | null>(null);
  protected readonly closeError = signal<string | null>(null);
  protected readonly addSeanceError = signal<string | null>(null);
  protected readonly members = signal<PartieMemberDto[]>([]);

  // AD-4 : `participants` n'est renvoyé par le backend que pour CAMPAGNE_EPISODIQUE (toujours
  // `undefined` sinon) — sa seule présence sert de signal fiable, sans avoir à threader `partieKind`
  // jusqu'ici (cette page routée n'a pas accès au signal `characters` de `partie-detail`).
  protected readonly isEpisodique = computed(() => this.scenario()?.participants !== undefined);
  protected readonly characters = signal<CharacterDto[]>([]);
  protected readonly participantCharacters = computed(() => {
    const ids = new Set((this.scenario()?.participants ?? []).map((p) => p.userId));
    return this.characters().filter((c) => ids.has(c.userId));
  });
  // Un participant peut rejoindre une enquête avant d'avoir créé son personnage sur cette Partie —
  // sans ce fallback, la section resterait vide pour lui malgré une participation bien enregistrée.
  protected readonly participantsWithoutCharacter = computed(() => {
    const characterUserIds = new Set(this.characters().map((c) => c.userId));
    return (this.scenario()?.participants ?? []).filter((p) => !characterUserIds.has(p.userId));
  });

  constructor() {
    effect(() => {
      const s = this.scenarioInput();
      this.scenario.set(s);
      this.descriptionDraft.set(s.description ?? '');
      this.resumeFinDraft.set(s.resumeFin ?? '');
    });
  }

  async ngOnInit(): Promise<void> {
    // Le scénario reçu en input peut être un instantané mis en cache par l'appelant (ex. une
    // ScenarioTimeline chargée avant qu'un vote lié à une séance ait été tranché via le calendrier,
    // en dehors de cette page) — on recharge une version fraîche au montage plutôt que de faire
    // confiance à l'input pour la durée de vie du composant.
    try {
      const fresh = (await this.scenarios.listAll(this.scenarioInput().partieId)).find(
        (s) => s.id === this.scenarioInput().id,
      );
      if (fresh) this.scenario.set(fresh);
    } catch {
      // Le scénario reçu en input reste affiché tel quel si le rafraîchissement échoue.
    }
    try {
      this.documents.set(await this.scenarios.listDocuments(this.scenarioInput().id));
    } catch {
      this.documentsError.set('Impossible de charger les documents. Réessayez.');
    }
    try {
      this.characters.set(await this.characterService.listByPartie(this.scenarioInput().partieId));
    } catch {
      // Liste de participants non-critique pour cette page — dégradation silencieuse plutôt
      // qu'un blocage, cohérent avec le fait que la section participants reste secondaire ici.
    }
    try {
      this.members.set(await this.partiesService.members(this.scenarioInput().partieId));
    } catch {
      // Liste MJ pour PollStatusPanel (relance de vote) — non-critique, même dégradation silencieuse.
    }
  }

  protected async onFieldConfirm(field: ScenarioTextField, value: string | number): Promise<void> {
    const s = this.scenario();
    if (!s || this.isReadOnly()) return;
    this.fieldEditError.set(null);
    try {
      this.scenario.set(await this.scenarios.update(s.id, { [field]: value }));
    } catch (err) {
      this.fieldEditError.set(
        extractErrorMessage(err, 'Impossible d’enregistrer la modification.'),
      );
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
      this.fieldEditError.set(
        extractErrorMessage(err, 'Impossible d’enregistrer la modification.'),
      );
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

  private async upload(
    file: File,
    partieId: string,
    scenarioId: string | undefined,
  ): Promise<void> {
    this.uploadError.set(null);
    try {
      await this.scenarios.uploadDocument(partieId, file, scenarioId);
      const s = this.scenario();
      if (s) this.documents.set(await this.scenarios.listDocuments(s.id));
    } catch (err) {
      this.uploadError.set(
        extractErrorMessage(err, "Impossible d'envoyer le document. Réessayez."),
      );
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

  protected async close(): Promise<void> {
    const s = this.scenario();
    if (!s || s.status !== 'COURANT') return;
    this.closeError.set(null);
    try {
      this.scenario.set(await this.scenarios.close(s.id));
    } catch (err) {
      this.closeError.set(extractErrorMessage(err, 'Impossible de clôturer ce scénario.'));
    }
  }

  protected async addSeance(): Promise<void> {
    const s = this.scenario();
    if (!s) return;
    this.addSeanceError.set(null);
    try {
      this.scenario.set(await this.scenarios.addSeance(s.id));
    } catch (err) {
      this.addSeanceError.set(extractErrorMessage(err, 'Impossible d’ajouter une séance.'));
    }
  }

  protected async submitResumeFin(): Promise<void> {
    const s = this.scenario();
    if (!s) return;
    this.resumeFinError.set(null);
    try {
      this.scenario.set(await this.scenarios.setResumeFin(s.id, this.resumeFinDraft()));
    } catch (err) {
      this.resumeFinError.set(
        extractErrorMessage(err, 'Impossible d’enregistrer le résumé de fin.'),
      );
    }
  }

  protected onSeanceLinked(updated: ScenarioDto): void {
    this.scenario.set(updated);
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
