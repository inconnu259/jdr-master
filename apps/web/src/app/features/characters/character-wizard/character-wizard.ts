import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { computeDerived, type DerivedStats, type RyuutamaSheetData } from '@master-jdr/game-rules';
import type { ContentEntryDto, GameSystemContentDto } from '@master-jdr/shared';
import { CharacterService } from '../../../core/characters/character.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { ClassStep } from './steps/class-step/class-step';
import { TypeStep } from './steps/type-step/type-step';
import { AttributesStep } from './steps/attributes-step/attributes-step';
import { WeaponStep } from './steps/weapon-step/weapon-step';
import { FetishStep } from './steps/fetish-step/fetish-step';
import { EquipmentStep, FIXED_EQUIPMENT } from './steps/equipment-step/equipment-step';
import { NarrativeStep } from './steps/narrative-step/narrative-step';
import {
  PortraitCropper,
  type PortraitCropData,
  type PortraitCropResult,
} from '../portrait-cropper/portrait-cropper';

type AttrKey = 'AGI' | 'ESP' | 'INT' | 'VIG';

/** Les 8 étapes du plugin Ryuutama, portrait inclus (Story 4.5). */
const SUPPORTED_STEP_KEYS = new Set([
  'classId',
  'typeId',
  'attributes',
  'weaponCategoryId',
  'fetiqueObject',
  'equipment',
  'narrative',
  'portrait',
]);

interface CreationStep {
  key: string;
  label: string;
}

/** Mapping du `field` retourné par `validate()` (packages/game-rules) vers la clé d'étape à rouvrir. */
const FIELD_TO_STEP_KEY: Record<string, string> = {
  classId: 'classId',
  specialtyTypeId: 'classId',
  typeId: 'typeId',
  attributes: 'attributes',
  weaponCategoryId: 'weaponCategoryId',
};

interface ServerValidationError {
  field: string;
  message: string;
}

@Component({
  selector: 'app-character-wizard',
  standalone: true,
  imports: [
    MatButtonModule,
    ClassStep,
    TypeStep,
    AttributesStep,
    WeaponStep,
    FetishStep,
    EquipmentStep,
    NarrativeStep,
    PortraitCropper,
  ],
  templateUrl: './character-wizard.html',
  styleUrl: './character-wizard.scss',
})
export class CharacterWizard implements OnInit {
  private readonly characterSvc = inject(CharacterService);
  private readonly partiesSvc = inject(PartiesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly theme = inject(ThemeToneService);

  /** Résolu depuis le paramètre de route `:id` dans `ngOnInit()`. */
  protected partieId = '';
  /** Système de jeu de la partie, résolu dans `ngOnInit()` (jamais codé en dur — cf. Partie.gameSystemId). */
  private gameSystemId = '';

  /**
   * Piloté par `GameSystemSchemaDto.creationSteps` (AC1) — jamais codé en dur, pour que le
   * wizard reste générique et réutilisable par un futur plugin (NFR5).
   */
  protected readonly steps = signal<CreationStep[]>([]);
  protected readonly loadError = signal<string | null>(null);

  protected readonly currentStepIndex = signal(0);
  protected readonly content = signal<GameSystemContentDto | null>(null);
  protected readonly sheetData = signal<Partial<RyuutamaSheetData>>({
    equipment: {
      individual: FIXED_EQUIPMENT.individual.map((name) => ({
        id: crypto.randomUUID(),
        name,
        weight: 0,
        addedBy: 'player' as const,
      })),
      group: FIXED_EQUIPMENT.group,
    },
  });
  protected readonly submitting = signal(false);
  protected readonly stepErrors = signal<Record<string, string[]>>({});

  /** Étape "équipement" du wizard : affiche uniquement les noms (poids/provenance gérés après
   *  création, cf. Story 6.4 `InventoryTab`) — `EquipmentStep` reste un composant `string[]`. */
  protected readonly individualEquipmentNames = computed(
    () => this.sheetData().equipment?.individual?.map((item) => item.name) ?? [],
  );

  /** Portrait : hors `sheetData` (vit sur `Character.portraitUrl`/`portraitCropData`, uploadé après création). */
  protected readonly pendingPortraitFile = signal<File | null>(null);
  protected readonly pendingCropData = signal<PortraitCropData | null>(null);

  protected readonly currentStepKey = computed(
    () => this.steps()[this.currentStepIndex()]?.key ?? '',
  );
  protected readonly currentStepLabel = computed(
    () => this.steps()[this.currentStepIndex()]?.label ?? '',
  );
  protected readonly isFirstStep = computed(() => this.currentStepIndex() === 0);
  protected readonly isLastStep = computed(
    () => this.currentStepIndex() === this.steps().length - 1,
  );

  protected readonly derived = computed<DerivedStats | null>(() => {
    const attrs = this.sheetData().attributes;
    if (!attrs) return null;
    return computeDerived({ ...this.sheetData(), attributes: attrs } as RyuutamaSheetData);
  });

  protected readonly classes = computed<ContentEntryDto[]>(() => this.content()?.['class'] ?? []);
  protected readonly types = computed<ContentEntryDto[]>(() => this.content()?.['type'] ?? []);
  protected readonly weapons = computed<ContentEntryDto[]>(
    () => this.content()?.['weaponCategory'] ?? [],
  );
  protected readonly attributePattern = computed<ContentEntryDto | null>(
    () => this.content()?.['attributePattern']?.[0] ?? null,
  );

  protected readonly canGoNext = computed(() => {
    const data = this.sheetData();
    switch (this.currentStepKey()) {
      case 'classId':
        if (!data.classId) return false;
        if (data.classId === 'artisan' && !data.specialtyTypeId?.trim()) return false;
        return true;
      case 'typeId':
        return !!data.typeId;
      case 'attributes':
        return !!data.attributes;
      case 'weaponCategoryId':
        return !!data.weaponCategoryId;
      default:
        return true;
    }
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.partieId = id;
    try {
      // `partie-detail.ts` passe déjà `gameSystemId` en query param (il l'a chargé juste avant) —
      // évite un aller-retour réseau redondant. Repli sur un fetch de la partie uniquement pour
      // une navigation directe (lien partagé, rechargement de page) où le paramètre est absent.
      const gameSystemIdParam = this.route.snapshot.queryParamMap.get('gameSystemId');
      this.gameSystemId = gameSystemIdParam ?? (await this.partiesSvc.get(id)).gameSystemId;
      const [schema, content] = await Promise.all([
        this.characterSvc.getGameSystemSchema(this.gameSystemId),
        this.characterSvc.getGameSystemContent(this.gameSystemId),
      ]);
      const allSteps = (schema.creationSteps as CreationStep[]) ?? [];
      this.steps.set(allSteps.filter((s) => SUPPORTED_STEP_KEYS.has(s.key)));
      this.content.set(content);
    } catch {
      this.loadError.set(
        "Impossible de charger l'assistant de création. Vérifiez votre connexion et réessayez.",
      );
    }
  }

  protected goNext(): void {
    if (this.submitting() || !this.canGoNext() || this.isLastStep()) return;
    this.currentStepIndex.update((i) => i + 1);
  }

  protected goPrev(): void {
    if (this.submitting() || this.isFirstStep()) return;
    this.currentStepIndex.update((i) => i - 1);
  }

  protected onPortraitSaved(result: PortraitCropResult): void {
    this.pendingPortraitFile.set(result.file);
    this.pendingCropData.set(result.cropData);
  }

  /** L'étape Portrait est la dernière — "Passer cette étape" finalise directement (AC1), il n'y a pas d'étape suivante. */
  protected onPortraitSkip(): void {
    this.pendingPortraitFile.set(null);
    this.pendingCropData.set(null);
    void this.onSubmit();
  }

  protected updateSheetData(patch: Partial<RyuutamaSheetData>): void {
    this.sheetData.update((d) => {
      const next = { ...d, ...patch };
      // Une spécialité saisie pour Artisan n'a plus de sens si le joueur change de classe.
      if ('classId' in patch && patch.classId !== 'artisan') {
        delete next.specialtyTypeId;
      }
      return next;
    });
  }

  protected onAttributesChange(attrs: Record<AttrKey, number> | null): void {
    this.sheetData.update((d) => ({ ...d, attributes: attrs ?? undefined }));
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.stepErrors.set({});
    try {
      const created = await this.characterSvc.create(this.partieId, {
        gameSystemId: this.gameSystemId,
        sheetData: this.sheetData(),
      });

      const portraitFile = this.pendingPortraitFile();
      if (portraitFile) {
        try {
          await this.characterSvc.updatePortrait(created.id, portraitFile, this.pendingCropData());
        } catch {
          // Le personnage existe déjà : un échec d'upload ne doit pas se présenter comme un
          // échec de création (cf. Dev Notes Story 4.5) — avertissement non bloquant.
          this.snack.open(
            "Personnage créé, mais le portrait n'a pas pu être enregistré. Réessayez depuis la fiche.",
            undefined,
            { duration: 5000 },
          );
        }
      }

      this.router.navigate(['/parties', this.partieId, 'characters', created.id]);
    } catch (err) {
      this.handleSubmitError(err);
    } finally {
      this.submitting.set(false);
    }
  }

  private handleSubmitError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) {
      this.snack.open('Une erreur inattendue est survenue. Réessayez.', undefined, {
        duration: 4000,
      });
      return;
    }

    if (err.status === 409) {
      const message = typeof err.error?.message === 'string' ? err.error.message : undefined;
      this.snack.open(message ?? 'Vous avez déjà un personnage sur cette partie', undefined, {
        duration: 4000,
      });
      this.router.navigate(['/parties', this.partieId]);
      return;
    }

    if (err.status === 400) {
      const rawMessage = err.error?.message;
      const errors: ServerValidationError[] = Array.isArray(rawMessage)
        ? rawMessage.filter(
            (e): e is ServerValidationError =>
              typeof e === 'object' && e !== null && typeof e.field === 'string',
          )
        : [];

      if (errors.length === 0) {
        // Corps 400 générique (ex. validation DTO renvoyant un tableau de strings) : pas de
        // champ exploitable pour rouvrir une étape précise, mais on informe quand même l'utilisateur.
        const genericMessage =
          typeof rawMessage === 'string' ? rawMessage : 'Données invalides. Vérifiez votre saisie.';
        this.snack.open(genericMessage, undefined, { duration: 4000 });
        return;
      }

      const grouped: Record<string, string[]> = {};
      for (const e of errors) {
        const stepKey = FIELD_TO_STEP_KEY[e.field] ?? e.field;
        (grouped[stepKey] ??= []).push(e.message);
      }
      this.stepErrors.set(grouped);

      const firstStepKey = FIELD_TO_STEP_KEY[errors[0].field] ?? errors[0].field;
      const stepIndex = this.steps().findIndex((s) => s.key === firstStepKey);
      this.currentStepIndex.set(stepIndex >= 0 ? stepIndex : 0);
      return;
    }

    this.snack.open('Une erreur inattendue est survenue. Réessayez.', undefined, {
      duration: 4000,
    });
  }
}
