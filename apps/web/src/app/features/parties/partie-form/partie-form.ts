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
import type { PartieKind } from '@master-jdr/shared';
import { PartiesService } from '../../../core/parties/parties.service';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { PartyBanner } from '../../../shared/party-banner/party-banner';

type FormKind = PartieKind;

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
    PartyBanner,
  ],
  templateUrl: './partie-form.html',
  styleUrl: './partie-form.scss',
})
export class PartieForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly parties = inject(PartiesService);
  private readonly myPartiesSvc = inject(MyPartiesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly theme = inject(ThemeToneService);
  protected readonly systems = GAME_SYSTEMS;
  protected readonly editId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Nom courant de la partie (édition) — sert uniquement au monogramme de repli de
   *  `PartyBanner` (Story 29.12), jamais persisté ici (le nom se sauvegarde via `submit()`). */
  protected readonly partieName = signal('');
  /** `null` = bannière générée (Story 29.12, AC1/AC3) — dépôt/retrait vivent hors du
   *  formulaire réactif : ce n'est pas un champ enregistré par `submit()`. */
  protected readonly coverImageVersion = signal<string | null>(null);
  protected readonly coverSaving = signal(false);
  protected readonly coverError = signal<string | null>(null);

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
    this.partieName.set(p.name);
    this.coverImageVersion.set(p.coverImageVersion);
    this.form.patchValue({
      name: p.name,
      gameSystemId: p.gameSystemId,
      kind: p.kind,
      description: p.description ?? '',
    });
  }

  /** Dépôt de l'image de couverture (AC1) — indépendant de `submit()` : l'image se dépose
   *  immédiatement, pas seulement à l'enregistrement du reste du formulaire. */
  async onCoverFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de redéposer le même fichier une seconde fois
    const id = this.editId();
    if (!file || !id) return;
    // Garde anti-double-clic (Review Findings) — même patron qu'ailleurs dans le projet (ex.
    // favoris du Dashboard) : `[disabled]="coverSaving()"` a un délai de peinture, un second
    // déclenchement avant ce délai enverrait deux dépôts concurrents pour la même partie.
    if (this.coverSaving()) return;

    this.coverSaving.set(true);
    this.coverError.set(null);
    try {
      const updated = await this.parties.setCoverImage(id, file);
      this.coverImageVersion.set(updated.coverImageVersion);
    } catch {
      this.coverError.set("Impossible d'enregistrer l'image de couverture.");
    } finally {
      this.coverSaving.set(false);
    }
  }

  /** Retrait de l'image de couverture (AC3) — la bannière générée reprend sa place. */
  async removeCoverImage(): Promise<void> {
    const id = this.editId();
    if (!id) return;
    if (this.coverSaving()) return; // garde anti-double-clic (Review Findings)
    this.coverSaving.set(true);
    this.coverError.set(null);
    try {
      const updated = await this.parties.removeCoverImage(id);
      this.coverImageVersion.set(updated.coverImageVersion);
    } catch {
      this.coverError.set("Impossible de retirer l'image de couverture.");
    } finally {
      this.coverSaving.set(false);
    }
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
      await this.myPartiesSvc.refreshMjParties();
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
