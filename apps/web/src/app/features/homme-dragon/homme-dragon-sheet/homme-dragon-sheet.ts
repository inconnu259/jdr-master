import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import type { ContentEntryDto, HommeDragonDto, HommeDragonRace } from '@master-jdr/shared';
import { HommeDragonCreationWizard } from '../homme-dragon-creation-wizard/homme-dragon-creation-wizard';
import { RACES, RACE_LABELS } from '../homme-dragon-races';
import { HommeDragonService } from '../../../core/homme-dragon/homme-dragon.service';
import { CharacterService } from '../../../core/characters/character.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { DetailSurface } from '../../../shared/detail-surface/detail-surface';
import {
  createDetailSurfaceHost,
  detailContent,
  type DetailSurfaceContent,
} from '../../../shared/detail-surface/detail-surface-host';

/** Familles des souffles communs (Story 33.2), dans l'ordre du livre (`docs/dragons.md`,
 *  « Souffles communs ») — libellé et consigne d'usage transcrits tels quels ; `consigne` est
 *  `null` quand le livre n'en donne pas (souffles aidant les PNJ). */
type SouffleFamille = 'temps' | 'destin' | 'pnj';

const SOUFFLE_FAMILLES: SouffleFamille[] = ['temps', 'destin', 'pnj'];

const SOUFFLE_FAMILLE_INFO: Record<SouffleFamille, { label: string; consigne: string | null }> = {
  temps: {
    label: 'Souffles manipulant le temps',
    consigne: 'ne peuvent pas être mis en réserve, coûtent 2 PS',
  },
  destin: {
    label: 'Souffles manipulant le destin',
    consigne: 'à utiliser juste avant ou après un jet de dés',
  },
  pnj: { label: 'Souffles aidant les PNJ', consigne: null },
};

/** Niveau des « souffles multicolores » (`docs/dragons.md`, « Niveaux ») : à partir de là,
 *  l'homme-dragon peut choisir des souffles appartenant à une autre race que la sienne. */
const SOUFFLES_MULTICOLORES_LEVEL = 3;

type SouffleData = {
  label?: string;
  description?: string;
  ps?: number;
  race?: string;
  famille?: string;
  reservable?: boolean;
};

const souffleData = (entry: ContentEntryDto): SouffleData => (entry.data ?? {}) as SouffleData;

/**
 * Onglet « Homme Dragon » de `PartieDetail` (Story 10.1) — embarqué directement (pas de route
 * dédiée, un seul Homme Dragon par Partie, même schéma que `ScenarioOneShotTab`). Gère les deux
 * états : parcours de création guidé si `findOne()` renvoie `null`, fiche + édition d'artefact sinon.
 * Historique/voyageurs protégés/niveau/PS/pouvoir d'éveil/export PDF : Stories 10.2-10.5.
 */
@Component({
  selector: 'app-homme-dragon-sheet',
  imports: [
    FormsModule,
    MatButtonModule,
    DatePipe,
    NgTemplateOutlet,
    DetailSurface,
    HommeDragonCreationWizard,
  ],
  templateUrl: './homme-dragon-sheet.html',
  styleUrl: './homme-dragon-sheet.scss',
})
export class HommeDragonSheet implements OnInit {
  readonly partieId = input.required<string>();
  /** Titre de la Partie — pré-remplit `mondesProteges` à la création (AC1), éditable ensuite. */
  readonly partieName = input.required<string>();

  private readonly hommeDragonSvc = inject(HommeDragonService);
  private readonly characterSvc = inject(CharacterService);
  protected readonly theme = inject(ThemeToneService);

  protected readonly raceLabel = (race: HommeDragonRace): string => RACE_LABELS[race];

  /**
   * Surface de détail (Story 33.1) — même plomberie que `CharacterSheet` : un seul emplacement
   * ouvert à la fois, le jeton d'ouverture et le retour du focus vivent dans le host partagé.
   */
  protected readonly detail = createDetailSurfaceHost();

  /** `undefined` = chargement en cours, `null` = pas encore créé, sinon la fiche existante. */
  protected readonly hommeDragon = signal<HommeDragonDto | null | undefined>(undefined);
  protected readonly artefactCatalog = signal<ContentEntryDto[]>([]);
  protected readonly loadError = signal<string | null>(null);

  /** Nom affiché sur la fiche — même convention de repli que `characterName()`
   *  (`character.util.ts`) : valeur normalisée ou libellé de repli en français si absente. */
  protected readonly displayName = computed<string>(
    () => this.hommeDragon()?.sheetData.nom?.trim() || 'Homme Dragon sans nom',
  );

  /** Posé à la création : affiche le bandeau « fiche créée » (le parcours guidé vit dans
   *  `HommeDragonCreationWizard`, Story 33.3). */
  protected readonly justCreated = signal(false);

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

  /** Libellé affiché de l'artefact courant : `nom` personnalisé par le MJ en priorité, sinon le
   *  `label` du catalogue `hommeDragonArtefact`, sinon la clé brute en dernier repli. */
  protected readonly artefactLabel = computed<string>(() => {
    const hd = this.hommeDragon();
    if (!hd) return '';
    const art = hd.sheetData.artefact;
    const catalogData = this.artefactCatalog().find((e) => e.key === art.key)?.data as
      { label?: string } | undefined;
    return art.nom?.trim() || catalogData?.label || art.key;
  });

  /** Contenu de la surface de détail pour l'artefact courant (Story 33.1) — `null` quand ni
   *  l'`inscription` du MJ ni la `description` du catalogue ne sont disponibles (pas de
   *  déclencheur dans ce cas, cf. `detailContent()`). */
  protected readonly artefactDetail = computed<DetailSurfaceContent | null>(() => {
    const hd = this.hommeDragon();
    if (!hd) return null;
    const art = hd.sheetData.artefact;
    const catalogData = this.artefactCatalog().find((e) => e.key === art.key)?.data as
      { description?: string } | undefined;
    return detailContent(this.artefactLabel(), art.inscription?.trim() || catalogData?.description);
  });

  constructor() {
    // Story 20.2 (AC1) : réagit au signal générique HommeDragonService.changed (RealtimeService).
    // PIÈGE (même classe que CharacterSheet, Story 20.1) : HommeDragonSheet a DÉJÀ un chargement
    // dédié dans ngOnInit() (fetch au montage). La première exécution d'un effect() a lieu à la
    // CONSTRUCTION du composant — si `changed()` porte déjà une valeur (mutation locale antérieure
    // dans la même session applicative, HommeDragonService étant `providedIn: 'root'`), cette
    // première exécution déclencherait un refetch REDONDANT avec celui que ngOnInit() fait juste
    // après. Le flag `firstRun` neutralise uniquement cette toute première exécution.
    let firstRun = true;
    effect(() => {
      this.hommeDragonSvc.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => void this.refreshHommeDragon());
    });
  }

  // Utilisée UNIQUEMENT par l'effect() ci-dessus — PAS par le fetch initial de ngOnInit(), qui
  // reste ciblé par this.partieId() (jamais par une valeur dérivée de this.hommeDragon(), pas
  // encore garantie peuplée au moment où ngOnInit() s'exécute, même piège de timing que
  // Story 20.1). `hommeDragon() === undefined` signifie « chargement initial en cours » —
  // distinct de `null` (« pas encore créé », un état stable, pas un signe qu'il faille attendre).
  private async refreshHommeDragon(): Promise<void> {
    if (this.hommeDragon() === undefined) return;
    try {
      this.hommeDragon.set(await this.hommeDragonSvc.findOne(this.partieId()));
    } catch {
      // non-bloquant — la fiche affichée reste telle quelle si le rafraîchissement échoue
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const [hommeDragon, content] = await Promise.all([
        this.hommeDragonSvc.findOne(this.partieId()),
        this.characterSvc.getGameSystemContent('ryuutama'),
      ]);
      this.hommeDragon.set(hommeDragon);
      this.artefactCatalog.set(content['hommeDragonArtefact'] ?? []);
      this.eveilPowerCatalog.set(content['eveilPower'] ?? []);
      this.souffleCatalog.set(content['souffle'] ?? []);
    } catch {
      // Revue de code : ne plus forcer `hommeDragon` à `null` ici — cette valeur signifie « pas
      // encore créée » et affiche le formulaire de création. Une erreur réseau/serveur transitoire
      // doit rester dans l'état `undefined` (indistinct du chargement) pour que le template affiche
      // le message d'erreur au lieu du formulaire, même si le MJ a déjà une fiche existante.
      this.loadError.set('Impossible de charger la fiche. Réessayez.');
    }
  }

  protected onCreated(created: HommeDragonDto): void {
    this.hommeDragon.set(created);
    this.justCreated.set(true);
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

  // — Choix d'un pouvoir d'éveil (Story 10.4) —
  protected readonly eveilPowerCatalog = signal<ContentEntryDto[]>([]);
  protected readonly currentPendingLevel = computed(
    () => this.hommeDragon()?.pendingEveilLevels[0] ?? null,
  );
  /** Pool commun à toutes les races (décision utilisateur, Story 10.4) : le sélecteur propose tous
   * les pouvoirs du catalogue non encore choisis, pas un filtrage par niveau — un pouvoir d'éveil
   * n'est jamais lié à un niveau de déblocage précis. */
  protected readonly eveilPowersForCurrentLevel = computed(() => {
    const chosenKeys = new Set((this.hommeDragon()?.eveilPowers ?? []).map((ep) => ep.key));
    return this.eveilPowerCatalog().filter((e) => !chosenKeys.has(e.key));
  });
  protected readonly selectedEveilPowerKey = signal<string | null>(null);
  protected readonly choosingEveilPower = signal(false);
  protected readonly eveilPowerError = signal<string | null>(null);

  protected eveilPowerLabel(key: string): string {
    const entry = this.eveilPowerCatalog().find((e) => e.key === key);
    return entry ? ((entry.data as { label?: string }).label ?? key) : key;
  }

  /** Contenu de la surface de détail d'un pouvoir d'éveil déjà choisi (Story 33.1) — `null` quand
   *  le catalogue ne porte pas de `description` pour cette clé (pas de déclencheur dans ce cas). */
  protected eveilPowerDetail(key: string): DetailSurfaceContent | null {
    const entry = this.eveilPowerCatalog().find((e) => e.key === key);
    const description = (entry?.data as { description?: string } | undefined)?.description;
    return detailContent(this.eveilPowerLabel(key), description);
  }

  protected async onChooseEveilPower(): Promise<void> {
    const level = this.currentPendingLevel();
    const key = this.selectedEveilPowerKey();
    if (!key || !level || this.choosingEveilPower()) return;
    this.choosingEveilPower.set(true);
    this.eveilPowerError.set(null);
    try {
      const updated = await this.hommeDragonSvc.chooseEveilPower(this.partieId(), { level, key });
      this.hommeDragon.set(updated);
      this.selectedEveilPowerKey.set(null);
    } catch {
      this.eveilPowerError.set("Impossible d'enregistrer ce choix. Réessayez.");
    } finally {
      this.choosingEveilPower.set(false);
    }
  }

  // — Souffles disponibles (Story 33.2) —
  protected readonly souffleCatalog = signal<ContentEntryDto[]>([]);

  // Lecture seule, catalogue `souffle` (`souffles.json`) UNIQUEMENT : les éveils
  // (`eveilPowerCatalog`) ne sont jamais des souffles — la Q-13 qui les assimilait aux souffles
  // communs reposait sur une confusion, levée le 2026-09-25 par `docs/dragons.md`. Indépendant du
  // choix de pouvoir d'éveil au level-up ci-dessus (`eveilPowersForCurrentLevel`,
  // `chooseEveilPower()`), que ces listes n'affectent jamais. Pas de réserve ni de décompte ici
  // (story dédiée).

  /** Souffles communs (sans `race`), groupés par famille dans l'ordre du livre. Une famille sans
   *  entrée au catalogue n'est pas affichée ; une entrée commune sans famille connue non plus. */
  protected readonly commonSouffleGroups = computed(() => {
    const communs = this.souffleCatalog().filter((e) => !souffleData(e).race);
    return SOUFFLE_FAMILLES.map((famille) => ({
      famille,
      ...SOUFFLE_FAMILLE_INFO[famille],
      souffles: communs.filter((e) => souffleData(e).famille === famille),
    })).filter((g) => g.souffles.length > 0);
  });

  /** Souffles propres à la race du dragon affiché — vide (sans erreur) si le catalogue n'en porte
   *  aucun pour cette race. */
  protected readonly raceSouffles = computed<ContentEntryDto[]>(() => {
    const race = this.hommeDragon()?.sheetData.race;
    if (!race) return [];
    return this.souffleCatalog().filter((e) => souffleData(e).race === race);
  });

  /** Souffles des trois autres races, groupés par race (ordre de `RACES`) — uniquement à partir
   *  du niveau des souffles multicolores, vide en dessous. */
  protected readonly otherRaceSouffleGroups = computed(() => {
    const hd = this.hommeDragon();
    if (!hd || hd.derived.level < SOUFFLES_MULTICOLORES_LEVEL) return [];
    return RACES.filter((r) => r !== hd.sheetData.race)
      .map((race) => ({
        race,
        souffles: this.souffleCatalog().filter((e) => souffleData(e).race === race),
      }))
      .filter((g) => g.souffles.length > 0);
  });

  protected readonly hasSouffles = computed(
    () =>
      this.commonSouffleGroups().length > 0 ||
      this.raceSouffles().length > 0 ||
      this.otherRaceSouffleGroups().length > 0,
  );

  /** Libellé d'un souffle : `label` du catalogue, repli sur la clé brute si le catalogue est
   *  incomplet — même patron que `artefactLabel()`/`eveilPowerLabel()`. */
  protected souffleLabel(entry: ContentEntryDto): string {
    return souffleData(entry).label || entry.key;
  }

  /** Coût affiché (« 1 PS », « 2 PS »…), `null` si `ps` est absent — pas de garde runtime sur la
   *  complétude du catalogue (discipline de revue de contenu uniquement, cf. spec). */
  protected souffleCost(entry: ContentEntryDto): string | null {
    const ps = souffleData(entry).ps;
    return typeof ps === 'number' ? `${ps} PS` : null;
  }

  /** `true` pour les souffles qui ne peuvent pas être mis en réserve (souffles du temps). */
  protected souffleNonReservable(entry: ContentEntryDto): boolean {
    return souffleData(entry).reservable === false;
  }

  /** Contenu de la surface de détail d'un souffle (même patron que `eveilPowerDetail()`) — `null`
   *  quand le catalogue ne porte pas de `description` (pas de déclencheur dans ce cas). */
  protected souffleDetail(entry: ContentEntryDto): DetailSurfaceContent | null {
    return detailContent(this.souffleLabel(entry), souffleData(entry).description);
  }

  // — Export PDF (Story 10.5, deux formats Story 33.4) —
  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  protected readonly exportMenuOpen = signal(false);

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  protected toggleExportMenu(): void {
    if (this.exportMenuOpen()) {
      this.closeExportMenu(true);
      return;
    }
    this.exportMenuOpen.set(true);
    // Le menu n'existe dans le DOM qu'après le prochain rendu : le focus va sur son premier item.
    afterNextRender(() => this.exportMenuItems()[0]?.focus(), { injector: this.injector });
  }

  protected closeExportMenu(restoreFocus = false): void {
    this.exportMenuOpen.set(false);
    if (restoreFocus) this.restoreFocusToExportTrigger();
  }

  private exportTrigger(): HTMLButtonElement | null {
    return this.host.nativeElement.querySelector<HTMLButtonElement>(
      '.homme-dragon-sheet__export-trigger',
    );
  }

  /** Après le prochain rendu (le déclencheur peut être désactivé tant que l'export court). */
  private restoreFocusToExportTrigger(): void {
    afterNextRender(() => this.exportTrigger()?.focus(), { injector: this.injector });
  }

  private exportMenuItems(): HTMLButtonElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
        '.homme-dragon-sheet__export-item',
      ),
    );
  }

  /** Clavier du menu (patron WAI-ARIA « menu button ») : Échap referme et rend le focus au
   *  déclencheur, flèches haut/bas bouclent sur les entrées, Début/Fin vont aux extrémités. */
  protected onExportMenuKeydown(event: KeyboardEvent): void {
    const items = this.exportMenuItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => {
      event.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.closeExportMenu(true);
        break;
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(items.length - 1);
        break;
      case 'Tab':
        // Le focus passe au déclencheur AVANT la fermeture (l'item focalisé va disparaître du DOM) ;
        // pas de preventDefault : Tab continue depuis le déclencheur.
        this.exportTrigger()?.focus();
        this.closeExportMenu();
        break;
    }
  }

  protected async onExportPdf(format: 'editable' | '2pages'): Promise<void> {
    this.closeExportMenu();
    if (this.exporting()) return;
    this.exportError.set(null);
    this.exporting.set(true);
    try {
      const blob = await this.hommeDragonSvc.exportPdf(this.partieId(), format);
      const url = URL.createObjectURL(blob);
      const safeName = (this.hommeDragon()?.sheetData.nom || 'homme-dragon').replace(
        /[^a-z0-9-_]+/gi,
        '_',
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `homme-dragon-${safeName}-${format}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      this.exportError.set("Impossible d'exporter la fiche en PDF. Réessayez.");
    } finally {
      this.exporting.set(false);
      this.restoreFocusToExportTrigger();
    }
  }
}
