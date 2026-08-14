import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { GAME_SYSTEMS, checkPartieKindTransition } from '@master-jdr/shared';
import type { PartieKind, PartieKindTransitionRefusal, ScenarioDto } from '@master-jdr/shared';
import { PartiesService } from '../../../core/parties/parties.service';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { PartyBanner } from '../../../shared/party-banner/party-banner';

type FormKind = PartieKind;

/** Types proposés, dans l'ordre d'affichage. Source unique du gabarit de sélection. */
const KIND_OPTIONS: readonly FormKind[] = [
  'ONE_SHOT',
  'CAMPAGNE_LINEAIRE',
  'CAMPAGNE_EPISODIQUE',
] as const;

/** Formats acceptés par le contrôleur de couverture (`party-cover.controller.ts`). */
const ACCEPTED_COVER_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Plafond de dépôt appliqué AVANT tout envoi réseau (Story 29.14, AC14).
 *
 * TROISIÈME déclaration des 5 Mo, après `party-cover.controller.ts` et
 * `characters.controller.ts` — la Story 29.12 a acté que la valeur n'est pas factorisable côté
 * serveur (elle vit dans des décorateurs, qui ne peuvent pas lire une constante importée). Celle-ci
 * ne doit JAMAIS être plus permissive que celle du serveur : elle épargne un aller-retour réseau,
 * elle ne remplace pas la garde serveur.
 */
const MAX_COVER_SIZE = 5 * 1024 * 1024;

/** Ce qui s'affiche à la place du formulaire quand une conversion réclame un arbitrage. */
interface CourantChoice {
  kind: FormKind;
  scenarios: ScenarioDto[];
}

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
    MatProgressBarModule,
    MatRadioModule,
    PartyBanner,
  ],
  templateUrl: './partie-form.html',
  styleUrl: './partie-form.scss',
})
export class PartieForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly parties = inject(PartiesService);
  private readonly myPartiesSvc = inject(MyPartiesService);
  private readonly scenarios = inject(ScenariosService);
  private readonly contextualNav = inject(ContextualNavService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly theme = inject(ThemeToneService);
  protected readonly systems = GAME_SYSTEMS;
  protected readonly kindOptions = KIND_OPTIONS;
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

  /** Création uniquement (Story 29.14, AC12) : le fichier est retenu jusqu'à ce que la partie
   *  existe, puisqu'un dépôt a besoin d'un identifiant à cibler. */
  protected readonly pendingCoverFile = signal<File | null>(null);
  protected readonly pendingCoverPreview = signal<string | null>(null);

  /** Type de la partie tel qu'enregistré (édition) — référence pour savoir si le MJ demande une
   *  conversion, et pour évaluer la matrice. */
  private readonly savedKind = signal<FormKind | null>(null);
  private readonly partieClosed = signal(false);
  private readonly partieScenarios = signal<ScenarioDto[]>([]);
  protected readonly courantChoice = signal<CourantChoice | null>(null);
  protected readonly chosenCourantId = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    gameSystemId: ['draconis', [Validators.required]],
    kind: ['ONE_SHOT' as FormKind, [Validators.required]],
    description: [''],
  });

  /**
   * Verdicts de la matrice pour les trois types, à l'état actuel de la partie (AC11).
   *
   * Consomme exactement la même fonction que la garde serveur — le formulaire est l'écho, jamais
   * une seconde table de règles (Règle B). En création, tout est atteignable.
   */
  protected readonly kindAvailability = computed(() => {
    const from = this.savedKind();
    const state = {
      scenarioCount: this.partieScenarios().length,
      courantCount: this.partieScenarios().filter((s) => s.status === 'COURANT').length,
      isClosed: this.partieClosed(),
    };
    return KIND_OPTIONS.map((kind) => {
      if (from === null) return { kind, disabled: false, reason: null as string | null };
      const verdict = checkPartieKindTransition(from, kind, state);
      return {
        kind,
        disabled: !verdict.allowed,
        reason: verdict.allowed ? null : this.refusalLabel(verdict.refusal, state.scenarioCount),
      };
    });
  });

  /** Raison affichée sous un type désactivé — NFR-4 : jamais un bouton grisé muet. */
  private refusalLabel(refusal: PartieKindTransitionRefusal, scenarioCount: number): string {
    switch (refusal) {
      case 'PARTIE_CLOSED':
        return this.theme.tone()['partie.kind_refusal_closed'];
      case 'TOO_MANY_SCENARIOS_FOR_ONE_SHOT':
        return this.theme
          .tone()
          ['partie.kind_refusal_too_many_scenarios'].replace('{count}', String(scenarioCount));
    }
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    // Bandeau contextuel (patron Story 29.4) — le titre ne vit plus dans la carte, qui le
    // répétait (leçon de la Story 29.5, appliquée sans attendre un retour utilisateur).
    this.contextualNav.set({
      title: id ? this.theme.tone()['partie.edit_title'] : this.theme.tone()['partie.new_title'],
    });
    if (!id) return;

    this.editId.set(id);
    const p = await this.parties.get(id);
    this.partieName.set(p.name);
    this.coverImageVersion.set(p.coverImageVersion);
    this.savedKind.set(p.kind);
    this.partieClosed.set(p.status === 'TERMINEE');
    this.form.patchValue({
      name: p.name,
      gameSystemId: p.gameSystemId,
      kind: p.kind,
      description: p.description ?? '',
    });
    this.contextualNav.set({
      title: this.theme.tone()['partie.edit_title'],
      subtitle: p.name,
    });

    // Un seul appel, pour une seule partie : NFR-6 vise les appels proportionnels au NOMBRE de
    // parties, ce qui n'est pas le cas ici. Un échec ne bloque pas l'édition des autres champs —
    // la matrice reste alors permissive côté client, le serveur restant l'autorité (Règle B).
    try {
      this.partieScenarios.set(await this.scenarios.listAll(id));
    } catch {
      this.partieScenarios.set([]);
    }
  }

  /** Dépôt de l'image de couverture. En édition, immédiat (Story 29.12) ; en création, le fichier
   *  est retenu jusqu'à ce que la partie existe (AC12). */
  async onCoverFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de redéposer le même fichier une seconde fois
    if (!file) return;

    // AC14 — rejet local avant tout envoi réseau. Le serveur reste la garde réelle ; ceci évite
    // simplement de faire transiter un fichier voué au 413.
    const rejection = this.rejectCoverFile(file);
    if (rejection) {
      this.coverError.set(rejection);
      return;
    }
    this.coverError.set(null);

    const id = this.editId();
    if (!id) {
      // Création : rien à cibler encore, on retient le fichier pour l'après-`create()`.
      this.pendingCoverFile.set(file);
      this.pendingCoverPreview.set(URL.createObjectURL(file));
      return;
    }

    // Garde anti-double-clic (Review Findings 29.12) — même patron qu'ailleurs dans le projet :
    // `[disabled]="coverSaving()"` a un délai de peinture, un second déclenchement avant ce délai
    // enverrait deux dépôts concurrents pour la même partie.
    if (this.coverSaving()) return;

    this.coverSaving.set(true);
    try {
      const updated = await this.parties.setCoverImage(id, file);
      this.coverImageVersion.set(updated.coverImageVersion);
    } catch {
      this.coverError.set(this.theme.tone()['partie.cover_upload_error']);
    } finally {
      this.coverSaving.set(false);
    }
  }

  /** `null` si le fichier est acceptable, sinon le message expliquant la cause réelle (AC14/AC15). */
  private rejectCoverFile(file: File): string | null {
    if (!ACCEPTED_COVER_MIMES.includes(file.type)) {
      return this.theme.tone()['partie.cover_reject_type'];
    }
    if (file.size > MAX_COVER_SIZE) {
      return this.theme.tone()['partie.cover_reject_size'];
    }
    return null;
  }

  /** Retrait de l'image de couverture (AC3) — la bannière générée reprend sa place. */
  async removeCoverImage(): Promise<void> {
    const id = this.editId();
    if (!id) {
      // Création : il n'y a qu'un fichier en attente, rien de déposé.
      this.clearPendingCover();
      return;
    }
    if (this.coverSaving()) return; // garde anti-double-clic (Review Findings)
    this.coverSaving.set(true);
    this.coverError.set(null);
    try {
      const updated = await this.parties.removeCoverImage(id);
      this.coverImageVersion.set(updated.coverImageVersion);
    } catch {
      this.coverError.set(this.theme.tone()['partie.cover_remove_error']);
    } finally {
      this.coverSaving.set(false);
    }
  }

  protected clearPendingCover(): void {
    const preview = this.pendingCoverPreview();
    if (preview) URL.revokeObjectURL(preview);
    this.pendingCoverFile.set(null);
    this.pendingCoverPreview.set(null);
  }

  /** Annule l'arbitrage de scénario Courant et revient au formulaire. */
  protected cancelCourantChoice(): void {
    this.courantChoice.set(null);
    this.chosenCourantId.set(null);
    const saved = this.savedKind();
    if (saved) this.form.patchValue({ kind: saved });
  }

  protected confirmCourantChoice(): void {
    if (!this.chosenCourantId()) return;
    void this.submit();
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    if (this.saving()) return; // garde anti-double-clic, même patron que le dépôt de couverture

    const v = this.form.getRawValue();
    const id = this.editId();

    // AC9 — une conversion vers une campagne linéaire avec plusieurs COURANT réclame un arbitrage
    // AVANT d'être soumise : le serveur la refuserait sans `courantScenarioId`.
    if (id && this.needsCourantChoice(v.kind) && !this.chosenCourantId()) {
      this.courantChoice.set({
        kind: v.kind,
        scenarios: this.partieScenarios().filter((s) => s.status === 'COURANT'),
      });
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const payload = {
      name: v.name,
      gameSystemId: v.gameSystemId,
      kind: v.kind,
      description: v.description || undefined,
    };

    try {
      if (id) {
        // Décision utilisateur (2026-08-14, revue de code) : les champs simples s'enregistrent
        // D'ABORD, la conversion de type ENSUITE — l'ordre inverse (conversion en premier) lisait
        // `partie.name` côté serveur AVANT que le nom renommé dans ce même envoi ne soit enregistré,
        // si bien qu'un scénario auto-créé par la conversion (AC7, cas 3/5 à 0 scénario) pouvait
        // hériter d'un nom déjà périmé. Contrepartie assumée : un refus de conversion peut laisser
        // le nouveau nom enregistré sans le changement de type (rare, resoumission possible).
        await this.parties.update(id, payload);

        if (this.savedKind() !== null && v.kind !== this.savedKind()) {
          try {
            await this.parties.convertKind(id, v.kind, this.chosenCourantId() ?? undefined);
            this.savedKind.set(v.kind);
            this.courantChoice.set(null);
            this.chosenCourantId.set(null);
          } catch (err) {
            // AC15 — distinguer les causes : les autres champs SONT enregistrés, seule la
            // conversion de type a échoué (même précédent qu'AC12/`created_but_cover_failed`).
            this.error.set(
              this.serverMessage(err) ??
                this.theme.tone()['partie.fields_saved_but_convert_failed'],
            );
            return;
          }
        }

        await this.myPartiesSvc.refreshMjParties();
        void this.router.navigate(['/parties', id]);
        return;
      }

      const partie = await this.parties.create(payload);
      // AC12 — la partie existe désormais : on dépose l'image retenue. Un échec ici ne remet pas
      // en cause la création, et le message ne doit jamais laisser croire le contraire.
      const file = this.pendingCoverFile();
      if (file) {
        try {
          await this.parties.setCoverImage(partie.id, file);
          // Dépôt réussi : l'URL de blob locale n'a plus lieu d'être, la couverture réelle vient
          // désormais de coverImageVersion. Sans ce nettoyage, l'URL n'est jamais révoquée (fuite).
          this.clearPendingCover();
        } catch {
          this.error.set(this.theme.tone()['partie.created_but_cover_failed']);
          this.saving.set(false);
          this.editId.set(partie.id);
          this.savedKind.set(partie.kind);
          this.partieName.set(partie.name);
          this.clearPendingCover();
          return;
        }
      }
      await this.myPartiesSvc.refreshMjParties();
      void this.router.navigate(['/parties', partie.id]);
    } catch (err) {
      // AC15 — distinguer les causes plutôt qu'un texte unique. Un refus de conversion porte son
      // propre message serveur, qui nomme la cause réelle : le relayer plutôt que le masquer.
      this.error.set(this.serverMessage(err) ?? this.theme.tone()['partie.save_error']);
      this.courantChoice.set(null);
    } finally {
      this.saving.set(false);
    }
  }

  /** Vrai si la matrice exige de désigner le scénario qui reste Courant pour ce type cible. */
  private needsCourantChoice(kind: FormKind): boolean {
    const from = this.savedKind();
    if (from === null || from === kind) return false;
    const verdict = checkPartieKindTransition(from, kind, {
      scenarioCount: this.partieScenarios().length,
      courantCount: this.partieScenarios().filter((s) => s.status === 'COURANT').length,
      isClosed: this.partieClosed(),
    });
    return verdict.allowed && verdict.requiresCourantChoice;
  }

  /** Extrait le message d'une erreur HTTP Nest (`{ message: string | string[] }`), s'il existe. */
  private serverMessage(err: unknown): string | null {
    const message = (err as { error?: { message?: unknown } })?.error?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    return null;
  }

  cancel(): void {
    // Une URL de blob créée pour l'aperçu du fichier en attente (création, AC12) ne se révoque
    // jamais toute seule — sans cet appel elle fuirait à chaque annulation avec fichier choisi.
    this.clearPendingCover();
    const id = this.editId();
    void this.router.navigate(id ? ['/parties', id] : ['/']);
  }
}
