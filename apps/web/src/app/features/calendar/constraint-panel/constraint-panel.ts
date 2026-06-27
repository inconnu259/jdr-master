import { Component, DestroyRef, OnInit, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { AvailabilityDeclarationDto, CreateAvailabilityDto, DaySlot } from '@master-jdr/shared';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import {
  addMonths,
  buildConstraintDto,
  toISODate,
  type ConstraintFormValue,
} from './constraint-panel.utils';

export { buildConstraintDto, type ConstraintFormValue } from './constraint-panel.utils';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soirée',
  FULL_DAY: 'Journée entière',
};

const RECUR_LABEL: Record<string, string> = {
  RECURRING: 'récurrente',
  PUNCTUAL: 'ponctuelle',
};

@Component({
  selector: 'app-constraint-panel',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatRadioModule],
  templateUrl: './constraint-panel.html',
  styleUrl: './constraint-panel.scss',
})
export class ConstraintPanel implements OnInit {
  readonly date = input.required<Date>();
  readonly slot = input.required<DaySlot>();
  readonly existingDeclaration = input<AvailabilityDeclarationDto | null>(null);

  readonly saved = output<AvailabilityDeclarationDto>();
  readonly deleted = output<void>();
  readonly cancelled = output<void>();
  readonly formChanged = output<CreateAvailabilityDto | null>();

  private readonly fb = inject(FormBuilder);
  private readonly availabilitySvc = inject(AvailabilityService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly theme = inject(ThemeToneService);
  private readonly snack = inject(MatSnackBar);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);
  protected readonly confirmingReplace = signal(false);
  protected readonly today = toISODate(new Date());

  protected readonly form = this.fb.nonNullable.group({
    slot: ['MORNING' as DaySlot],
    kind: ['UNAVAILABLE' as 'UNAVAILABLE' | 'AVAILABLE'],
    type: ['PONCTUEL' as 'PONCTUEL' | 'RECURRENT' | 'PLAGE'],
    expiresAt: [''],
    startDate: [''],
    endDate: [''],
  });

  readonly SLOT_LABELS = SLOT_LABELS;

  constructor() {
    // Re-initialise le formulaire à chaque changement de cellule (date / slot / déclaration existante).
    // Couvre aussi le cas où l'utilisateur clique une nouvelle cellule pendant que le panneau est ouvert :
    // CalendarView garde panelOpen=true (pas de ngOnInit), mais cet effet se relance.
    effect(() => {
      const existing = this.existingDeclaration();
      const slot = this.slot();
      this.date(); // suivi — utilisé indirectement dans prefill et tryBuildPreviewDto

      untracked(() => {
        this.confirmingReplace.set(false);
        this.confirmingDelete.set(false);
        this.error.set(null);
        if (existing) {
          this.prefill(existing);
        } else {
          this.form.patchValue({
            slot,
            type: 'PONCTUEL',
            expiresAt: addMonths(new Date(), 6),
            startDate: toISODate(this.date()), // pré-rempli pour PLAGE
          });
        }
      });
    });
  }

  ngOnInit(): void {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.confirmingReplace.set(false);
      this.formChanged.emit(this.tryBuildPreviewDto());
    });
    // Émet le preview initial au cas où l'effet a tourné avant que l'abonnement soit actif.
    this.formChanged.emit(this.tryBuildPreviewDto());
  }

  protected get panelTitle(): string {
    const dateLabel = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(this.date());
    return dateLabel;
  }

  protected get isFormValid(): boolean {
    const v = this.form.getRawValue() as ConstraintFormValue;
    if (v.type === 'RECURRENT' && !v.expiresAt) return false;
    if (v.type === 'PLAGE') {
      if (!v.startDate || !v.endDate) return false;
      if (v.endDate < v.startDate) return false; // comparaison lexicographique YYYY-MM-DD = chronologique
    }
    return true;
  }

  private prefill(d: AvailabilityDeclarationDto): void {
    let type: 'PONCTUEL' | 'RECURRENT' | 'PLAGE' = 'PONCTUEL';
    if (d.recurKind === 'RECURRING') {
      type = 'RECURRENT';
    } else if (d.startDate && d.endDate) {
      const cellDateStr = toISODate(this.date());
      // PONCTUEL = PUNCTUAL où startDate = endDate = date de la cellule sélectionnée
      // PLAGE = tout autre PUNCTUAL (dates différentes ou plage d'un jour sur une autre date)
      if (d.startDate !== d.endDate || d.startDate !== cellDateStr) {
        type = 'PLAGE';
      }
    }
    this.form.patchValue({
      slot: d.slot,
      kind: d.kind as 'UNAVAILABLE' | 'AVAILABLE',
      type,
      expiresAt: d.expiresAt.substring(0, 10),
      startDate: d.startDate ?? '',
      endDate: d.endDate ?? '',
    });
  }

  private tryBuildPreviewDto(): CreateAvailabilityDto | null {
    const v = this.form.getRawValue() as ConstraintFormValue;
    if (v.type === 'RECURRENT' && !v.expiresAt) return null;
    if (v.type === 'PLAGE' && (!v.startDate || !v.endDate)) return null;
    try {
      return buildConstraintDto(v, this.date());
    } catch {
      return null;
    }
  }

  protected async onSave(): Promise<void> {
    if (!this.isFormValid || this.saving()) return;
    const existing = this.existingDeclaration();
    if (existing?.recurKind === 'RECURRING') {
      this.confirmingReplace.set(true);
      return;
    }
    await this.doActualSave();
  }

  protected async executeReplace(): Promise<void> {
    if (this.saving()) return; // garde contre le double-clic
    this.confirmingReplace.set(false);
    await this.doActualSave();
  }

  private async doActualSave(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const dto = buildConstraintDto(this.form.getRawValue() as ConstraintFormValue, this.date());
      // Créer avant de supprimer : si la création échoue, l'ancienne déclaration est préservée.
      const result = await this.availabilitySvc.createDeclaration(dto);
      const existing = this.existingDeclaration();
      if (existing) await this.availabilitySvc.deleteDeclaration(existing.id);
      this.snack.open(this.theme.tone()['success.constraint_saved'], undefined, { duration: 3000 });
      this.saved.emit(result);
    } catch {
      this.error.set("Impossible d'enregistrer la contrainte.");
    } finally {
      this.saving.set(false);
    }
  }

  protected onDeleteClick(): void {
    if (this.saving()) return; // garde contre le double-clic
    const existing = this.existingDeclaration();
    if (!existing) return;
    if (existing.recurKind === 'RECURRING') {
      this.confirmingDelete.set(true);
    } else {
      void this.doDelete(existing);
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (this.saving()) return; // garde contre le double-clic
    const existing = this.existingDeclaration();
    if (existing) await this.doDelete(existing);
  }

  private async doDelete(existing: AvailabilityDeclarationDto): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.availabilitySvc.deleteDeclaration(existing.id);
      this.deleted.emit();
    } catch {
      this.error.set('Impossible de supprimer la contrainte.');
    } finally {
      this.saving.set(false);
      this.confirmingDelete.set(false);
    }
  }

  protected recurLabel(recurKind: string): string {
    return RECUR_LABEL[recurKind] ?? recurKind;
  }
}
