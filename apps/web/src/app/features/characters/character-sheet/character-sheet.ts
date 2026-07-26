import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import type { CharacterDto, GameSystemContentDto } from '@master-jdr/shared';
import { CharacterService } from '../../../core/characters/character.service';
import { characterName, findContentEntry } from '../../../core/characters/character.util';
import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';
import { CharacterAvatar } from '../character-avatar/character-avatar';
import { PortraitPanel } from '../portrait-panel/portrait-panel';
import {
  PortraitCropper,
  type PortraitCropperData,
  type PortraitCropResult,
} from '../portrait-cropper/portrait-cropper';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LevelUpBanner } from './level-up-banner/level-up-banner';
import { LevelUpWizard, type LevelUpWizardData } from './level-up-wizard/level-up-wizard';
import { HistoryTab } from './history-tab/history-tab';
import { InventoryTab } from './inventory-tab/inventory-tab';
import { NotesJournal } from './notes-journal/notes-journal';
import { FieldEditPencil, type FieldEditPencilOption } from './field-edit-pencil/field-edit-pencil';
import {
  capabilityDescription,
  getCapabilitiesByType,
  getOtherCapabilities,
} from './capability-label.util';

interface ClassTalentFull {
  id?: string;
  name: string;
  effect: { description: string; conditions: string };
}

export type RequiredChoiceKind =
  | 'eligible-talent'
  | 'landscape-flavor'
  | 'closed-list'
  | 'landscape-capability';

interface RequiredChoiceOption {
  value: string;
  label: string;
}

interface RequiredChoice {
  key: string;
  talentId: string;
  kind: RequiredChoiceKind;
  label: string;
  options?: RequiredChoiceOption[];
}

interface ClassData {
  label: string;
  talents: ClassTalentFull[];
  requiredChoices?: RequiredChoice[];
}

/**
 * Choix de classe résolu pour affichage (Story 23.8) — le talent emprunté (Métier d'appoint), le
 * paysage narratif (Métamorphose) ou le type de créature (Autorité). Climatophile (kind
 * `landscape-capability`) n'apparaît jamais ici : il est affiché par la section "Paysage/climat
 * favori" existante (`landscapes` ci-dessus), une fois `classCapabilities` fusionné par
 * `getFlatCapabilities()` (Task 6).
 */
export interface ClassChoiceDisplay {
  key: string;
  kind: RequiredChoiceKind;
  label: string;
  talentName?: string;
  talentEffectDescription?: string;
  malus?: string;
  originClassLabel?: string;
  valueLabel?: string;
}

interface TypeData {
  label: string;
  advantages: { name: string; effect: string }[];
}

interface WeaponData {
  label: string;
  touchFormula: string;
  damageFormula: string;
}

interface AttributePatternData {
  label: string;
  values: number[];
}

interface NarrativeFields {
  sex?: string;
  age?: string;
  physicalTraits?: string;
  homeTown?: string;
  motivation?: string;
  personality?: string;
}

@Component({
  selector: 'app-character-sheet',
  standalone: true,
  imports: [
    CharacterAvatar,
    MatButtonModule,
    PortraitPanel,
    LevelUpBanner,
    HistoryTab,
    InventoryTab,
    NotesJournal,
    FieldEditPencil,
  ],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.scss',
})
export class CharacterSheet implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly characterSvc = inject(CharacterService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeToneService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly character = signal<CharacterDto | null>(null);
  protected readonly content = signal<GameSystemContentDto | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly exportError = signal<string | null>(null);
  protected readonly exporting = signal<'editable' | '2pages' | null>(null);
  protected readonly exportEquipmentError = signal<string | null>(null);
  protected readonly exportingEquipment = signal(false);
  protected readonly exportNotesError = signal<string | null>(null);
  protected readonly exportingNotes = signal(false);
  protected readonly portraitError = signal<string | null>(null);

  protected readonly sheetData = computed(
    () => (this.character()?.sheetData ?? {}) as Record<string, unknown>,
  );
  protected readonly name = computed(() => {
    const c = this.character();
    return c ? characterName(c) : '';
  });

  /**
   * Le MJ peut consulter la fiche d'un personnage de ses joueurs (lecture seule), mais jamais
   * modifier son portrait — seul le propriétaire le peut (FR39, cf. Dev Notes Story 4.5). Le CTA
   * "Modifier le portrait" ne doit donc s'afficher que pour le propriétaire.
   */
  protected readonly isOwner = computed(
    () => !!this.character() && this.character()?.userId === this.auth.currentUser()?.id,
  );

  /**
   * Le viewer est le MJ de la Partie — lu directement depuis `CharacterDto.viewerIsMj` (résolu
   * côté serveur, Story 6.5 revue de code), **pas** une heuristique "tout non-propriétaire = MJ".
   * Cette ancienne heuristique était fausse dès qu'un fellow player (ni propriétaire, ni MJ) a pu
   * consulter la fiche d'un coéquipier (`findOne` élargi à tout participant, cf. Story 6.5) : il
   * aurait alors vu à tort la section Historique et le badge MJ. `!isOwner()` reste requis en plus
   * du champ API : un MJ consultant **sa propre** fiche (`viewerIsMj` API = true, `isOwner()` =
   * true aussi) ne doit pas afficher le badge "vous consultez la fiche de quelqu'un d'autre" —
   * `isOwner()` prime toujours (cf. tests dédiés).
   */
  protected readonly viewerIsMj = computed(
    () => !this.isOwner() && (this.character()?.viewerIsMj ?? false),
  );

  protected readonly classData = computed<ClassData | null>(() =>
    findContentEntry<ClassData>(
      this.content(),
      'class',
      this.sheetData()['classId'] as string | undefined,
    ),
  );

  protected readonly typeData = computed<TypeData | null>(() =>
    findContentEntry<TypeData>(
      this.content(),
      'type',
      this.sheetData()['typeId'] as string | undefined,
    ),
  );

  protected readonly weaponData = computed<WeaponData | null>(() =>
    findContentEntry<WeaponData>(
      this.content(),
      'weaponCategory',
      this.sheetData()['weaponCategoryId'] as string | undefined,
    ),
  );

  /** Suggestions catalogue pour la combobox de l'arme de prédilection (AC7, Story 6.7). */
  protected readonly weaponOptions = computed<FieldEditPencilOption[]>(() =>
    (this.content()?.['weaponCategory'] ?? []).map((entry) => ({
      key: entry.key,
      label: (entry.data as WeaponData).label,
    })),
  );

  /** Spécialité texte libre de la classe Artisan (seule classe l'exigeant), sinon `undefined`. */
  protected readonly specialtyTypeId = computed<string | undefined>(
    () => this.sheetData()['specialtyTypeId'] as string | undefined,
  );

  /**
   * Capacités sans section structurelle dédiée (Protection d'un dragon, Voyage légendaire, et
   * tout type futur du même genre) — petit encart générique, cf. EXPERIENCE.md §4. Le choix fait
   * pour chaque montée de niveau structurelle (Attribut/Paysage/Immunité/Classe/Type) est, lui,
   * visible directement dans la section Historique (fusion Historique/choix, cf. `HistoryTab`).
   */
  protected readonly otherCapabilities = computed(() => {
    const c = this.character();
    if (!c) return [];
    return getOtherCapabilities(c).map((entry) => ({
      level: entry.level,
      text: capabilityDescription(entry, this.content()),
    }));
  });

  /**
   * Classe secondaire (capacité 'class', niveau 5) — sous-bloc de la section Vocation, cf.
   * EXPERIENCE.md §4 "Intégration des capacités dans la fiche". Un seul choix possible par
   * `LEVEL_TABLE` (contrairement au paysage/climat, obtenu jusqu'à 2 fois).
   */
  protected readonly secondaryClass = computed<ClassData | null>(() => {
    const c = this.character();
    if (!c) return null;
    const key = getCapabilitiesByType(c, 'class')[0]?.capability.params['key'] as
      | string
      | undefined;
    return findContentEntry<ClassData>(this.content(), 'class', key);
  });

  /** Type secondaire (capacité 'type', niveau 6) — sous-bloc de la section Voie. */
  protected readonly secondaryType = computed<TypeData | null>(() => {
    const c = this.character();
    if (!c) return null;
    const key = getCapabilitiesByType(c, 'type')[0]?.capability.params['key'] as string | undefined;
    return findContentEntry<TypeData>(this.content(), 'type', key);
  });

  /** Paysages/climats favoris obtenus (capacité 'landscape', niveaux 3 et 7 — jusqu'à 2). */
  protected readonly landscapes = computed<string[]>(() => {
    const c = this.character();
    if (!c) return [];
    return getCapabilitiesByType(c, 'landscape')
      .map(
        (entry) =>
          findContentEntry<{ label: string }>(
            this.content(),
            'landscape',
            entry.capability.params['key'] as string | undefined,
          )?.label,
      )
      .filter((label): label is string => !!label);
  });

  /**
   * Choix de classe résolus pour affichage (Story 23.8) — talent emprunté (Métier d'appoint),
   * paysage narratif (Métamorphose), type de créature (Autorité). Le climat de Climatophile
   * (kind `landscape-capability`) n'est jamais inclus ici : il apparaît via la section
   * "Paysage/climat favori" existante (`landscapes` ci-dessus), cf. Task 6/Dev Notes.
   */
  protected readonly classChoiceDisplays = computed<ClassChoiceDisplay[]>(() => {
    const data = this.classData();
    if (!data?.requiredChoices?.length) return [];
    const classChoices =
      (this.sheetData()['classChoices'] as Record<string, string> | undefined) ?? {};

    return data.requiredChoices
      .map((choice): ClassChoiceDisplay | null => {
        if (choice.kind === 'landscape-capability') return null;
        const value = classChoices[choice.key];
        if (!value) return null;

        if (choice.kind === 'eligible-talent') {
          const [originClassKey, talentId] = value.split(':');
          const originClassData = findContentEntry<ClassData>(
            this.content(),
            'class',
            originClassKey,
          );
          const talent = originClassData?.talents.find((t) => t.id === talentId);
          // Valeur malformée ou talent introuvable (revue de code, 2026-07-26) : ne pas afficher
          // un malus/label incomplets avec un nom de talent vide — préférer ne rien afficher.
          if (!talent) return null;
          return {
            key: choice.key,
            kind: choice.kind,
            label: choice.label,
            talentName: talent.name,
            talentEffectDescription: talent.effect.description,
            malus: '-1',
            originClassLabel: originClassData?.label,
          };
        }

        if (choice.kind === 'landscape-flavor') {
          const landscapeLabel = findContentEntry<{ label: string }>(
            this.content(),
            'landscape',
            value,
          )?.label;
          return {
            key: choice.key,
            kind: choice.kind,
            label: choice.label,
            valueLabel: landscapeLabel ?? value,
          };
        }

        // closed-list (ex. Autorité du Dresseur)
        const optionLabel = choice.options?.find((o) => o.value === value)?.label;
        return {
          key: choice.key,
          kind: choice.kind,
          label: choice.label,
          valueLabel: optionLabel ?? value,
        };
      })
      .filter((d): d is ClassChoiceDisplay => d !== null);
  });

  /** Immunités obtenues (capacité 'immunity', niveau 4). */
  protected readonly immunities = computed<string[]>(() => {
    const c = this.character();
    if (!c) return [];
    return getCapabilitiesByType(c, 'immunity')
      .map(
        (entry) =>
          findContentEntry<{ label: string }>(
            this.content(),
            'immunityState',
            entry.capability.params['key'] as string | undefined,
          )?.label,
      )
      .filter((label): label is string => !!label);
  });

  protected readonly attributes = computed<{
    AGI: number;
    ESP: number;
    INT: number;
    VIG: number;
  } | null>(
    () =>
      (this.sheetData()['attributes'] as { AGI: number; ESP: number; INT: number; VIG: number }) ??
      null,
  );

  /** Nom du pattern d'attributs dont les valeurs (triées) correspondent à celles du personnage. */
  protected readonly attributePatternLabel = computed<string | null>(() => {
    const attrs = this.attributes();
    if (!attrs) return null;
    const sortedOwn = [attrs.AGI, attrs.ESP, attrs.INT, attrs.VIG].sort((a, b) => a - b);
    const patterns = this.content()?.['attributePattern'] ?? [];
    for (const p of patterns) {
      const data = p.data as AttributePatternData;
      const sortedPattern = [...data.values].sort((a, b) => a - b);
      if (
        sortedPattern.length === sortedOwn.length &&
        sortedPattern.every((v, i) => v === sortedOwn[i])
      ) {
        return data.label;
      }
    }
    return null;
  });

  protected readonly fetiqueObject = computed<string | undefined>(
    () => this.sheetData()['fetiqueObject'] as string | undefined,
  );

  protected readonly narrative = computed<NarrativeFields>(
    () => (this.sheetData()['narrative'] as NarrativeFields) ?? {},
  );

  constructor() {
    // Story 20.1 (AC1) : réagit au signal générique CharacterService.changed (RealtimeService).
    // PIÈGE (même classe que ScenarioEditor, Story 19.2 Task 1) : CharacterSheet a DÉJÀ un
    // chargement dédié dans ngOnInit() (fetch au montage). La première exécution d'un effect() a
    // lieu à la CONSTRUCTION du composant — si `changed()` porte déjà une valeur (mutation locale
    // antérieure dans la même session applicative, CharacterService étant `providedIn: 'root'`),
    // cette première exécution déclencherait un refetch REDONDANT avec celui que ngOnInit() fait
    // juste après. Le flag `firstRun` neutralise uniquement cette toute première exécution.
    let firstRun = true;
    effect(() => {
      this.characterSvc.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => void this.refreshCharacter());
    });
  }

  // Utilisée UNIQUEMENT par l'effect() ci-dessus — PAS par le fetch initial de ngOnInit(), qui
  // reste ciblé par le paramètre de route characterId (jamais par this.character(), pas encore
  // garanti peuplé au moment où ngOnInit() s'exécute, même piège de timing que Story 19.2).
  private async refreshCharacter(): Promise<void> {
    const c = this.character();
    if (!c) return;
    try {
      this.character.set(await this.characterSvc.get(c.id));
    } catch {
      // non-bloquant — la fiche affichée reste telle quelle si le rafraîchissement échoue
    }
  }

  async ngOnInit(): Promise<void> {
    const partieId = this.route.snapshot.paramMap.get('id');
    if (partieId) {
      this.realtime.connect(partieTopic(partieId));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(partieId)));
    }

    const characterId = this.route.snapshot.paramMap.get('characterId');
    if (!characterId) {
      this.loadError.set('Fiche introuvable.');
      return;
    }
    try {
      this.character.set(await this.characterSvc.get(characterId));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.loadError.set("Vous n'avez pas accès à cette fiche.");
      } else {
        this.loadError.set('Impossible de charger la fiche de personnage. Réessayez.');
      }
      return;
    }
    try {
      const gameSystemId = this.character()!.gameSystemId;
      this.content.set(await this.characterSvc.getGameSystemContent(gameSystemId));
    } catch {
      // Contenu non critique pour l'affichage : la fiche reste consultable, seuls les
      // labels/talents/avantages résolus resteront vides.
    }
  }

  protected async exportPdf(format: 'editable' | '2pages'): Promise<void> {
    const c = this.character();
    if (!c) return;
    this.exportError.set(null);
    this.exporting.set(format);
    try {
      const blob = await this.characterSvc.exportPdf(c.id, format);
      const url = URL.createObjectURL(blob);
      const safeName = (this.name() || 'personnage').replace(/[^a-z0-9-_]+/gi, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `fiche-${safeName}-${format}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      this.exportError.set(this.theme.tone()['character.export_error']);
    } finally {
      this.exporting.set(null);
    }
  }

  protected async exportEquipmentPdf(): Promise<void> {
    const c = this.character();
    if (!c) return;
    this.exportEquipmentError.set(null);
    this.exportingEquipment.set(true);
    try {
      const blob = await this.characterSvc.exportEquipmentPdf(c.id);
      const url = URL.createObjectURL(blob);
      const safeName = (this.name() || 'personnage').replace(/[^a-z0-9-_]+/gi, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `equipement-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      this.exportEquipmentError.set(this.theme.tone()['character.export_error']);
    } finally {
      this.exportingEquipment.set(false);
    }
  }

  protected async exportNotesPdf(): Promise<void> {
    const c = this.character();
    if (!c) return;
    this.exportNotesError.set(null);
    this.exportingNotes.set(true);
    try {
      const blob = await this.characterSvc.exportNotesPdf(c.id);
      const url = URL.createObjectURL(blob);
      const safeName = (this.name() || 'personnage').replace(/[^a-z0-9-_]+/gi, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `notes-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      this.exportNotesError.set(this.theme.tone()['character.export_error']);
    } finally {
      this.exportingNotes.set(false);
    }
  }

  private portraitDialogOpen = false;

  protected editPortrait(): void {
    if (this.portraitDialogOpen || !this.isOwner()) return;
    const c = this.character();
    if (!c) return;
    this.portraitError.set(null);
    this.portraitDialogOpen = true;
    const ref = this.dialog.open<PortraitCropper, PortraitCropperData, PortraitCropResult | null>(
      PortraitCropper,
      { data: { characterId: c.id } },
    );
    ref.afterClosed().subscribe((result) => {
      this.portraitDialogOpen = false;
      if (!result) return;
      void this.savePortrait(c.id, result);
    });
  }

  private async savePortrait(characterId: string, result: PortraitCropResult): Promise<void> {
    try {
      const updated = await this.characterSvc.updatePortrait(
        characterId,
        result.file,
        result.cropData,
      );
      this.character.set(updated);
    } catch {
      this.portraitError.set("Le portrait n'a pas pu être enregistré. Réessayez.");
    }
  }

  /**
   * Recadrage dédié à l'export PDF (Story 4.7) : propriétaire seul, uniquement si un portrait
   * existe déjà (rien à recadrer sinon) — même garde que `editPortrait()`.
   */
  protected editPdfPortraitCrop(): void {
    if (this.portraitDialogOpen || !this.isOwner()) return;
    const c = this.character();
    if (!c || !c.portraitUrl) return;
    this.portraitError.set(null);
    this.portraitDialogOpen = true;
    const ref = this.dialog.open<PortraitCropper, PortraitCropperData, PortraitCropResult | null>(
      PortraitCropper,
      {
        data: {
          characterId: c.id,
          shape: 'rect',
          initialCropData: c.pdfPortraitCropData as PortraitCropResult['cropData'] | null,
        },
      },
    );
    ref.afterClosed().subscribe((result) => {
      this.portraitDialogOpen = false;
      if (!result) return;
      void this.savePdfPortraitCrop(c.id, result);
    });
  }

  private async savePdfPortraitCrop(
    characterId: string,
    result: PortraitCropResult,
  ): Promise<void> {
    try {
      const updated = await this.characterSvc.patchPdfPortraitCrop(characterId, result.cropData);
      this.character.set(updated);
    } catch {
      this.portraitError.set('Le cadrage PDF n’a pas pu être enregistré. Réessayez.');
    }
  }

  protected openLevelUpWizard(): void {
    if (this.portraitDialogOpen) return;
    const c = this.character();
    if (!c) return;
    this.portraitDialogOpen = true;
    const ref = this.dialog.open<LevelUpWizard, LevelUpWizardData, CharacterDto | null>(
      LevelUpWizard,
      { data: { character: c, content: this.content() } },
    );
    ref.afterClosed().subscribe((updated) => {
      this.portraitDialogOpen = false;
      if (updated) this.character.set(updated);
    });
  }

  protected readonly fieldEditWarning = signal<string | null>(null);
  protected readonly fieldEditError = signal<string | null>(null);

  /** Édition MJ générique d'un champ (AD-6) — attributs, objet fétiche, cf. `FieldEditPencil`. */
  protected async submitFieldEdit(path: string, value: string | number): Promise<void> {
    const c = this.character();
    if (!c) return;
    this.fieldEditError.set(null);
    this.fieldEditWarning.set(null);
    try {
      const result = await this.characterSvc.setSheetField(c.id, path, value);
      this.character.set(result.character);
      if (result.warnings.length > 0) {
        this.fieldEditWarning.set(result.warnings.join(' '));
      }
    } catch {
      this.fieldEditError.set(this.theme.tone()['evolution.mj_edit_error']);
    }
  }

  /** Édition MJ directe de l'XP (AD-6, endpoint dédié distinct de `submitFieldEdit`). */
  protected async submitXpEdit(value: string | number): Promise<void> {
    const c = this.character();
    if (!c) return;
    this.fieldEditError.set(null);
    try {
      this.character.set(await this.characterSvc.setXp(c.id, Number(value)));
    } catch {
      this.fieldEditError.set(this.theme.tone()['evolution.mj_edit_error']);
    }
  }

  /** Édition propriétaire-seul d'un champ narratif (Story 6.7) — chemin dédié, pas `sheet-field`. */
  protected async submitNarrativeFieldEdit(field: string, value: string | number): Promise<void> {
    const c = this.character();
    if (!c) return;
    this.fieldEditError.set(null);
    try {
      this.character.set(await this.characterSvc.updateNarrativeField(c.id, field, value));
    } catch {
      this.fieldEditError.set(this.theme.tone()['evolution.narrative_edit_error']);
    }
  }
}
