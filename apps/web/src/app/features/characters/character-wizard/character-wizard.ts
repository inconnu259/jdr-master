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
import {
  ClassStep,
  type ClassCapabilityPatch,
  type ClassChoicePatch,
} from './steps/class-step/class-step';
import { TypeStep } from './steps/type-step/type-step';
import { MagicStep } from './steps/magic-step/magic-step';
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

/** Projection minimale de `RequiredChoice` (cf. class-step.ts) utile au wizard — `kind`/`key` seulement. */
interface RequiredChoiceLike {
  key: string;
  kind: 'eligible-talent' | 'landscape-flavor' | 'closed-list' | 'landscape-capability';
}

/** Les 9 étapes du plugin Ryuutama, portrait inclus (Story 4.5) — `magic` ajoutée Story 23.9. */
const SUPPORTED_STEP_KEYS = new Set([
  'classId',
  'typeId',
  'magic',
  'attributes',
  'weaponCategoryId',
  'fetiqueObject',
  'equipment',
  'narrative',
  'portrait',
]);

/**
 * `magic` (Story 23.9) est la toute première étape **conditionnelle** du wizard — visible
 * uniquement si `typeId === 'magie'`. Jusqu'ici, `SUPPORTED_STEP_KEYS` suffisait à filtrer les
 * étapes (un filtre **statique**, jamais dépendant d'une donnée du personnage) : `steps()` est
 * donc désormais dérivé aussi de `sheetData().typeId`, recalculé à chaque changement de type.
 */
const CONDITIONAL_STEP_VISIBILITY: Record<string, (data: Partial<RyuutamaSheetData>) => boolean> =
  {
    magic: (data) => data.typeId === 'magie',
  };

interface CreationStep {
  key: string;
  label: string;
}

/**
 * L'étape Portrait n'a pas de texte dans le *Guide du Voyageur* (propre à cette app, pas au
 * système de jeu) — elle reste seule à vivre dans `tones.ts` (Story 23.3, AC5). Les 7 autres
 * étapes ont leur texte seedé dans `content['wizardStepIntro']` (`ContentType` Ryuutama,
 * cohérent avec AD-1) plutôt que codé en dur, pour rester générique multi-système (retour
 * utilisateur en revue de code du 2026-07-26 — corrige AD-9, cf. story file).
 */
const PORTRAIT_STEP_KEY = 'portrait';

/** Mapping du `field` retourné par `validate()` (packages/game-rules) vers la clé d'étape à rouvrir. */
const FIELD_TO_STEP_KEY: Record<string, string> = {
  classId: 'classId',
  specialtyTypeId: 'classId',
  typeId: 'typeId',
  attributes: 'attributes',
  weaponCategoryId: 'weaponCategoryId',
  // Règle 6 (Story 23.8) : `field` = `requiredChoices[].key` (ex. "fermier-metier-appoint",
  // "meteomancien-climatophile") — toujours résolu dans l'étape classId.
  'fermier-metier-appoint': 'classId',
  'ermite-metier-appoint': 'classId',
  'ermite-metamorphose': 'classId',
  'dresseur-autorite': 'classId',
  'meteomancien-climatophile': 'classId',
  // Règle 7 (Story 23.9) : choix de magie à la création, toujours résolus dans l'étape magic.
  magicSeason: 'magic',
  knownRitualSpells: 'magic',
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
    MagicStep,
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
   * Liste brute reçue du backend (`GameSystemSchemaDto.creationSteps`, filtrée par
   * `SUPPORTED_STEP_KEYS`) — jamais codée en dur, pour que le wizard reste générique et
   * réutilisable par un futur plugin (NFR5). Ne PAS utiliser directement pour la navigation :
   * cf. `steps` ci-dessous, qui filtre en plus les étapes conditionnelles (Story 23.9).
   */
  protected readonly allStepsRaw = signal<CreationStep[]>([]);
  protected readonly loadError = signal<string | null>(null);

  /**
   * Étapes réellement visibles compte tenu des données déjà saisies (Story 23.9 : `magic`
   * n'apparaît que si `typeId === 'magie'`). Recalculée à chaque changement de `sheetData()`.
   */
  protected readonly steps = computed<CreationStep[]>(() =>
    this.allStepsRaw().filter((s) => {
      const visible = CONDITIONAL_STEP_VISIBILITY[s.key];
      return !visible || visible(this.sheetData());
    }),
  );

  /**
   * Piloté par la **clé** de l'étape courante, pas par un index brut (Story 23.9) : si l'étape
   * `magic` disparaît de `steps()` après un aller-retour (le joueur change `typeId` après avoir
   * dépassé cette étape), un simple entier deviendrait incohérent (il pointerait sur la mauvaise
   * étape après le rétrécissement du tableau). `currentStepIndex`/`currentStepKey` ci-dessous
   * sont dérivés de cette clé à chaque lecture, jamais l'inverse — auto-cohérents même si la clé
   * suivie a disparu de `steps()` (repli sur la première étape visible, cf. `currentStepIndex`).
   */
  private readonly currentStepKeyTracked = signal('');
  protected readonly currentStepIndex = computed(() => {
    const idx = this.steps().findIndex((s) => s.key === this.currentStepKeyTracked());
    return idx >= 0 ? idx : 0;
  });
  protected readonly content = signal<GameSystemContentDto | null>(null);
  /**
   * Story 14.1 : `equipment.group` n'existe plus dans `RyuutamaSheetData` — l'ancien « Nécessaire
   * d'intendance (groupe) » est désormais fusionné dans `individual` (poids `0`), même sémantique
   * que la migration one-off pour les personnages existants. `contenants`/`animaux` : nouvelles
   * catégories introduites par cette story, aucune donnée pertinente à cette étape de création
   * (UI dédiée hors scope, cf. Story 14.2).
   */
  protected readonly sheetData = signal<Partial<RyuutamaSheetData>>({
    equipment: {
      individual: [...FIXED_EQUIPMENT.individual, ...FIXED_EQUIPMENT.group].map((name) => ({
        id: crypto.randomUUID(),
        name,
        weight: 0,
        addedBy: 'player' as const,
      })),
      contenants: [],
      animaux: [],
    },
  });
  protected readonly submitting = signal(false);
  protected readonly stepErrors = signal<Record<string, string[]>>({});

  /** Portrait : hors `sheetData` (vit sur `Character.portraitUrl`/`portraitCropData`, uploadé après création). */
  protected readonly pendingPortraitFile = signal<File | null>(null);
  protected readonly pendingCropData = signal<PortraitCropData | null>(null);

  /** Toujours dérivée de `currentStepIndex()`/`steps()` — jamais directement de `currentStepKeyTracked()`, pour rester auto-cohérente si la clé suivie a disparu de `steps()`. */
  protected readonly currentStepKey = computed(
    () => this.steps()[this.currentStepIndex()]?.key ?? '',
  );
  protected readonly currentStepLabel = computed(
    () => this.steps()[this.currentStepIndex()]?.label ?? '',
  );
  protected readonly wizardStepIntros = computed<ContentEntryDto[]>(
    () => this.content()?.['wizardStepIntro'] ?? [],
  );
  /** Texte d'introduction propre à l'étape courante (Story 23.3) — distinct du label court ci-dessus. */
  protected readonly stepIntroText = computed(() => {
    const key = this.currentStepKey();
    if (key === PORTRAIT_STEP_KEY) return this.theme.tone()['character.step_portrait_intro'];
    const entry = this.wizardStepIntros().find((e) => e.key === key);
    return (entry?.data as { text?: string } | undefined)?.text ?? '';
  });
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
  protected readonly landscapes = computed<ContentEntryDto[]>(
    () => this.content()?.['landscape'] ?? [],
  );
  protected readonly seasons = computed<ContentEntryDto[]>(
    () => this.content()?.['season'] ?? [],
  );
  /** Catalogue de sorts complet — `MagicStep` filtre lui-même rituelle/débutant (Story 23.9). */
  protected readonly spells = computed<ContentEntryDto[]>(() => this.content()?.['spell'] ?? []);
  protected readonly attributePattern = computed<ContentEntryDto | null>(
    () => this.content()?.['attributePattern']?.[0] ?? null,
  );

  /** `requiredChoices` de la classe sélectionnée (Story 23.8) — [] si la classe n'en a aucun. */
  private readonly selectedClassRequiredChoices = computed<RequiredChoiceLike[]>(() => {
    const entry = this.classes().find((c) => c.key === this.sheetData().classId);
    return (entry?.data as { requiredChoices?: RequiredChoiceLike[] } | undefined)
      ?.requiredChoices ?? [];
  });

  protected readonly canGoNext = computed(() => {
    const data = this.sheetData();
    switch (this.currentStepKey()) {
      case 'classId': {
        if (!data.classId) return false;
        if (data.classId === 'artisan' && !data.specialtyTypeId?.trim()) return false;
        const allChoicesAnswered = this.selectedClassRequiredChoices().every((choice) => {
          if (choice.kind === 'landscape-capability') {
            return (data.classCapabilities?.length ?? 0) > 0;
          }
          return !!data.classChoices?.[choice.key]?.trim();
        });
        if (!allChoicesAnswered) return false;
        return true;
      }
      case 'typeId':
        return !!data.typeId;
      case 'magic':
        return !!data.magicSeason && (data.knownRitualSpells?.length ?? 0) === 2;
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
      this.allStepsRaw.set(allSteps.filter((s) => SUPPORTED_STEP_KEYS.has(s.key)));
      this.content.set(content);
      this.currentStepKeyTracked.set(this.steps()[0]?.key ?? '');
    } catch {
      this.loadError.set(
        "Impossible de charger l'assistant de création. Vérifiez votre connexion et réessayez.",
      );
    }
  }

  protected goNext(): void {
    if (this.submitting() || !this.canGoNext() || this.isLastStep()) return;
    const next = this.steps()[this.currentStepIndex() + 1];
    if (next) this.currentStepKeyTracked.set(next.key);
  }

  protected goPrev(): void {
    if (this.submitting() || this.isFirstStep()) return;
    const prev = this.steps()[this.currentStepIndex() - 1];
    if (prev) this.currentStepKeyTracked.set(prev.key);
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
      // Les choix de magie n'ont plus de sens si le joueur change de type pour autre chose que
      // "magie" (Story 23.9) — même principe que le nettoyage specialtyTypeId ci-dessus.
      if ('typeId' in patch && patch.typeId !== 'magie') {
        delete next.magicSeason;
        delete next.knownRitualSpells;
      }
      // Les choix de classe (Métier d'appoint, Métamorphose, Autorité, Climatophile) ne
      // survivent pas à un changement de classe — ne garder que ceux dont la `key` correspond
      // à un `requiredChoices` de la NOUVELLE classe sélectionnée (Story 23.8).
      if ('classId' in patch) {
        const entry = this.classes().find((c) => c.key === patch.classId);
        const newRequiredChoices =
          (entry?.data as { requiredChoices?: RequiredChoiceLike[] } | undefined)
            ?.requiredChoices ?? [];
        const newKeys = new Set(newRequiredChoices.map((c) => c.key));
        const hasLandscapeCapability = newRequiredChoices.some(
          (c) => c.kind === 'landscape-capability',
        );
        if (next.classChoices) {
          const filtered = Object.fromEntries(
            Object.entries(next.classChoices).filter(([key]) => newKeys.has(key)),
          );
          if (Object.keys(filtered).length > 0) next.classChoices = filtered;
          else delete next.classChoices;
        }
        if (next.classCapabilities && !hasLandscapeCapability) {
          delete next.classCapabilities;
        }
      }
      return next;
    });
  }

  protected onClassChoiceChange(patch: ClassChoicePatch): void {
    this.sheetData.update((d) => ({
      ...d,
      classChoices: { ...(d.classChoices ?? {}), [patch.key]: patch.value },
    }));
  }

  protected onClassCapabilityChange(patch: ClassCapabilityPatch): void {
    this.sheetData.update((d) => ({
      ...d,
      classCapabilities: [{ type: 'landscape', params: { key: patch.landscapeKey } }],
    }));
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
      this.currentStepKeyTracked.set(firstStepKey);
      return;
    }

    this.snack.open('Une erreur inattendue est survenue. Réessayez.', undefined, {
      duration: 4000,
    });
  }
}
