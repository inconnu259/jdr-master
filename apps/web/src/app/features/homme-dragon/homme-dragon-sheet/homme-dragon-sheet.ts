import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import type { ContentEntryDto, HommeDragonDto, HommeDragonRace } from '@master-jdr/shared';
import { HommeDragonService } from '../../../core/homme-dragon/homme-dragon.service';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const RACES: HommeDragonRace[] = ['DRAGON_VERT', 'DRAGON_BLEU', 'DRAGON_ROUGE', 'DRAGON_NOIR'];

const RACE_LABELS: Record<HommeDragonRace, string> = {
  DRAGON_VERT: 'Dragon Vert',
  DRAGON_BLEU: 'Dragon Bleu',
  DRAGON_ROUGE: 'Dragon Rouge',
  DRAGON_NOIR: 'Dragon Noir',
};

/**
 * Onglet « Homme Dragon » de `PartieDetail` (Story 10.1) — embarqué directement (pas de route
 * dédiée, un seul Homme Dragon par Partie, même schéma que `ScenarioOneShotTab`). Gère les deux
 * états : formulaire de création si `findOne()` renvoie `null`, fiche + édition d'artefact sinon.
 * Historique/voyageurs protégés/niveau/PS/pouvoir d'éveil/export PDF : Stories 10.2-10.5.
 */
@Component({
  selector: 'app-homme-dragon-sheet',
  imports: [FormsModule, MatButtonModule, DatePipe],
  templateUrl: './homme-dragon-sheet.html',
})
export class HommeDragonSheet implements OnInit {
  readonly partieId = input.required<string>();
  /** Titre de la Partie — pré-remplit `mondesProteges` à la création (AC1), éditable ensuite. */
  readonly partieName = input.required<string>();

  private readonly hommeDragonSvc = inject(HommeDragonService);
  private readonly characterSvc = inject(CharacterService);
  protected readonly theme = inject(ThemeToneService);

  protected readonly races = RACES;
  protected readonly raceLabel = (race: HommeDragonRace): string => RACE_LABELS[race];

  /** `undefined` = chargement en cours, `null` = pas encore créé, sinon la fiche existante. */
  protected readonly hommeDragon = signal<HommeDragonDto | null | undefined>(undefined);
  protected readonly artefactCatalog = signal<ContentEntryDto[]>([]);
  protected readonly loadError = signal<string | null>(null);

  // — Formulaire de création —
  protected readonly race = signal<HommeDragonRace | null>(null);
  protected readonly artefactKey = signal<string | null>(null);
  protected readonly nom = signal('');
  protected readonly apparence = signal('');
  protected readonly caractere = signal('');
  protected readonly vocation = signal('');
  protected readonly demeure = signal('');
  protected readonly avatar = signal('');
  protected readonly mondesProteges = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly justCreated = signal(false);

  protected readonly artefactsForRace = computed(() => {
    const r = this.race();
    return this.artefactCatalog().filter((e) => (e.data as { race?: string }).race === r);
  });

  protected readonly isValid = computed(
    () => !!this.race() && !!this.artefactKey() && this.nom().trim().length > 0,
  );

  // — Édition de l'artefact (fiche existante) —
  protected readonly editingArtefact = signal(false);
  protected readonly editArtefactKey = signal<string | null>(null);
  protected readonly updating = signal(false);
  protected readonly updateError = signal<string | null>(null);

  protected readonly artefactsForExistingRace = computed(() => {
    const hd = this.hommeDragon();
    if (!hd) return [];
    return this.artefactCatalog().filter(
      (e) => (e.data as { race?: string }).race === hd.sheetData.race,
    );
  });

  async ngOnInit(): Promise<void> {
    try {
      const [hommeDragon, content] = await Promise.all([
        this.hommeDragonSvc.findOne(this.partieId()),
        this.characterSvc.getGameSystemContent('ryuutama'),
      ]);
      this.hommeDragon.set(hommeDragon);
      this.artefactCatalog.set(content['hommeDragonArtefact'] ?? []);
      if (hommeDragon === null) {
        this.mondesProteges.set(this.partieName());
      }
    } catch {
      // Revue de code : ne plus forcer `hommeDragon` à `null` ici — cette valeur signifie « pas
      // encore créée » et affiche le formulaire de création. Une erreur réseau/serveur transitoire
      // doit rester dans l'état `undefined` (indistinct du chargement) pour que le template affiche
      // le message d'erreur au lieu du formulaire, même si le MJ a déjà une fiche existante.
      this.loadError.set('Impossible de charger la fiche. Réessayez.');
    }
  }

  protected onRaceChange(race: HommeDragonRace): void {
    this.race.set(race);
    // Un changement de race invalide l'artefact déjà choisi (il appartenait à l'ancienne race).
    this.artefactKey.set(null);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isValid() || this.creating()) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const created = await this.hommeDragonSvc.create(this.partieId(), {
        race: this.race()!,
        artefact: { key: this.artefactKey()! },
        nom: this.nom().trim(),
        apparence: this.apparence().trim() || undefined,
        caractere: this.caractere().trim() || undefined,
        vocation: this.vocation().trim() || undefined,
        demeure: this.demeure().trim() || undefined,
        avatar: this.avatar().trim() || undefined,
        mondesProteges: this.mondesProteges().trim() || undefined,
      });
      this.hommeDragon.set(created);
      this.justCreated.set(true);
    } catch {
      this.createError.set('Impossible de créer votre Homme Dragon. Réessayez.');
    } finally {
      this.creating.set(false);
    }
  }

  protected openArtefactEdit(): void {
    this.editArtefactKey.set(this.hommeDragon()?.sheetData.artefact.key ?? null);
    this.updateError.set(null);
    this.editingArtefact.set(true);
    // Revue de code : le bandeau « fiche créée » restait affiché indéfiniment — le refermer dès
    // que le MJ interagit à nouveau avec la fiche (édition d'artefact), pas seulement à la création.
    this.justCreated.set(false);
  }

  protected async onArtefactSubmit(): Promise<void> {
    const key = this.editArtefactKey();
    if (!key || this.updating()) return;
    this.updating.set(true);
    this.updateError.set(null);
    try {
      const updated = await this.hommeDragonSvc.update(this.partieId(), {
        artefact: { key },
      });
      this.hommeDragon.set(updated);
      this.editingArtefact.set(false);
    } catch {
      this.updateError.set("Impossible de changer d'artefact. Réessayez.");
    } finally {
      this.updating.set(false);
    }
  }
}
