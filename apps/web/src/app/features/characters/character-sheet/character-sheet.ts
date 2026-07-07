import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import type { CharacterDto, GameSystemContentDto } from '@master-jdr/shared';
import { CharacterService } from '../../../core/characters/character.service';
import { characterName, findContentEntry } from '../../../core/characters/character.util';
import { CharacterAvatar } from '../character-avatar/character-avatar';
import { PortraitPanel } from '../portrait-panel/portrait-panel';
import {
  PortraitCropper,
  type PortraitCropperData,
  type PortraitCropResult,
} from '../portrait-cropper/portrait-cropper';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { AuthService } from '../../../core/auth/auth.service';

interface ClassData {
  label: string;
  talents: { name: string; effect: string }[];
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
  imports: [CharacterAvatar, MatButtonModule, PortraitPanel],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.scss',
})
export class CharacterSheet implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly characterSvc = inject(CharacterService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeToneService);

  protected readonly character = signal<CharacterDto | null>(null);
  protected readonly content = signal<GameSystemContentDto | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly exportError = signal<string | null>(null);
  protected readonly exporting = signal<'editable' | '2pages' | null>(null);
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
   * Le viewer est le MJ si l'accès en lecture a réussi (owner OU MJ, cf. Story 4.1) et qu'il n'est
   * pas le propriétaire — raccourci logique valide qui évite un appel réseau supplémentaire pour
   * connaître le `mjId` de la partie côté front. Affiche le pseudo du propriétaire (Story 4.6, AC2).
   * Exige un `currentUser()` non nul pour éviter d'afficher ce badge à un viewer déconnecté
   * (session invalidée alors que `character()` est déjà chargé).
   */
  protected readonly viewerIsMj = computed(
    () => !!this.character() && !!this.auth.currentUser() && !this.isOwner(),
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

  /** Spécialité texte libre de la classe Artisan (seule classe l'exigeant), sinon `undefined`. */
  protected readonly specialtyTypeId = computed<string | undefined>(
    () => this.sheetData()['specialtyTypeId'] as string | undefined,
  );

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

  protected readonly equipment = computed<{ individual: string[]; group: string[] } | null>(
    () => (this.sheetData()['equipment'] as { individual: string[]; group: string[] }) ?? null,
  );

  protected readonly fetiqueObject = computed<string | undefined>(
    () => this.sheetData()['fetiqueObject'] as string | undefined,
  );

  protected readonly narrative = computed<NarrativeFields>(
    () => (this.sheetData()['narrative'] as NarrativeFields) ?? {},
  );

  async ngOnInit(): Promise<void> {
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
}
