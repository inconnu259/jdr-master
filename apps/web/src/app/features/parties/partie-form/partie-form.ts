import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { GAME_SYSTEMS } from '@master-jdr/shared';
import { PartiesService } from '../../../core/parties/parties.service';
import { ModeService } from '../../../core/mode/mode.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

type FormKind = 'ONE_SHOT' | 'CAMPAGNE_LINEAIRE';

@Component({
  selector: 'app-partie-form',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatButtonToggleModule,
  ],
  templateUrl: './partie-form.html',
  styleUrl: './partie-form.scss',
})
export class PartieForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly parties = inject(PartiesService);
  private readonly modeSvc = inject(ModeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly theme = inject(ThemeToneService);
  protected readonly systems = GAME_SYSTEMS;
  protected readonly editId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    gameSystemId: ['draconis', [Validators.required]],
    kind: ['ONE_SHOT' as FormKind, [Validators.required]],
    description: [''],
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.editId.set(id);
    const p = await this.parties.get(id);
    this.form.patchValue({
      name: p.name,
      gameSystemId: p.gameSystemId,
      kind: p.kind === 'ONE_SHOT' ? 'ONE_SHOT' : 'CAMPAGNE_LINEAIRE',
      description: p.description ?? '',
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const payload = {
      name: v.name,
      gameSystemId: v.gameSystemId,
      kind: v.kind,
      description: v.description || undefined,
    };
    try {
      const id = this.editId();
      const partie = id
        ? await this.parties.update(id, payload)
        : await this.parties.create(payload);
      await this.modeSvc.refreshMjParties();
      this.modeSvc.setMode('mj');
      void this.router.navigate(['/parties', partie.id]);
    } catch {
      this.error.set("Impossible d'enregistrer la partie.");
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    const id = this.editId();
    void this.router.navigate(id ? ['/parties', id] : ['/']);
  }
}
