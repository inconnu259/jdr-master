import { Component, computed, inject, input } from '@angular/core';
import type { ListViewMode } from '@master-jdr/shared';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import {
  BANNER_VIEWBOX_HEIGHT,
  BANNER_VIEWBOX_WIDTH,
  bannerParams,
  partyMonogram,
  type BannerTint,
  type EmeraudeBanner,
  type ForetBanner,
  type GearTechnique,
  type SteampunkBanner,
} from '../../core/parties/party-banner.util';

/** Compteur d'instance : les identifiants SVG (`<use href>`, `<pattern>`, dégradés) doivent être
 *  uniques dans le document, or une liste rend jusqu'à une douzaine de bannières simultanées.
 *  Des identifiants fixes feraient pointer toutes les instances sur les défs de la première. */
let instanceCounter = 0;

/**
 * Rendu de la bannière générative d'une partie (Story 29.10).
 *
 * **Purement présentationnel et purement dérivé** : il n'appelle aucun service de données et ne
 * tire rien lui-même — tous les paramètres viennent de `bannerParams()`, le point de dérivation
 * unique d'AD-19. C'est ce qui garantit que la grande carte, la vignette moyenne et la vignette
 * de liste ne peuvent pas diverger.
 *
 * **Décoratif** : `aria-hidden` sur la racine. Le nom de la partie est déjà affiché en toutes
 * lettres à côté dans les trois modes — la bannière n'ajoute aucune information, elle ne doit
 * donc pas en annoncer.
 */
@Component({
  selector: 'app-party-banner',
  standalone: true,
  templateUrl: './party-banner.html',
  styleUrl: './party-banner.scss',
  host: {
    '[class.party-banner-host--large]': "mode() === 'large'",
    '[class.party-banner-host--medium]': "mode() === 'medium'",
    '[class.party-banner-host--compact]': "mode() === 'compact'",
  },
})
export class PartyBanner {
  private readonly theme = inject(ThemeToneService);

  readonly partieId = input.required<string>();
  /** Sert **uniquement** au monogramme. Il n'entre pas dans la graine : renommer une partie ne
   *  change pas sa composition (AC2). */
  readonly partieName = input.required<string>();
  readonly mode = input.required<ListViewMode>();

  protected readonly viewBoxWidth = BANNER_VIEWBOX_WIDTH;
  protected readonly viewBoxHeight = BANNER_VIEWBOX_HEIGHT;
  protected readonly viewBox = `0 0 ${BANNER_VIEWBOX_WIDTH} ${BANNER_VIEWBOX_HEIGHT}`;

  private readonly uid = `pb${++instanceCounter}`;
  protected readonly backgroundId = `${this.uid}-bg`;
  protected readonly gridId = `${this.uid}-grid`;

  /** Un seul appel de dérivation par instance, mémorisé. **Jamais depuis le template** : un appel
   *  de fonction dans un binding se réévalue à chaque cycle de détection, × 12 lignes en mode
   *  liste. */
  protected readonly params = computed(() =>
    bannerParams(this.partieId(), this.theme.activeTheme()),
  );

  /** Vues typées : `@switch` sur un champ ne restreint pas le type dans un template Angular.
   *  Trois signaux dédiés donnent au template un objet déjà discriminé. */
  protected readonly emeraude = computed<EmeraudeBanner | null>(() => {
    const p = this.params();
    return p.theme === 'grimoire-emeraude' ? p : null;
  });
  protected readonly foret = computed<ForetBanner | null>(() => {
    const p = this.params();
    return p.theme === 'foret-ancienne' ? p : null;
  });
  protected readonly steampunk = computed<SteampunkBanner | null>(() => {
    const p = this.params();
    return p.theme === 'medieval-steampunk' ? p : null;
  });

  protected readonly monogram = computed(() => partyMonogram(this.partieName()));

  /** Classe de teinte plutôt que style calculé : un `[style.color]` construit par concaténation
   *  passe par le sanitizer Angular et se fait silencieusement amputer. Ici, la feuille de style
   *  résout `--jdr-accent-1`/`--jdr-accent-2` du thème actif. */
  protected tintClass(tint: BannerTint): string {
    return tint === 'accent-1' ? 'tint-1' : 'tint-2';
  }

  protected gearHref(technique: GearTechnique): string {
    return `#${this.uid}-gear-${technique}`;
  }

  protected gearId(technique: GearTechnique): string {
    return `${this.uid}-gear-${technique}`;
  }

  protected backgroundFill(): string {
    return `url(#${this.backgroundId})`;
  }

  protected gridFill(): string {
    return `url(#${this.gridId})`;
  }

  /** Repère unique de la comète : un conteneur pivoté de θ, dans lequel la queue part de l'origine
   *  et la tête est posée à son extrémité. **Un seul θ** pilote orientation, position de tête et
   *  direction de vol (DESIGN.md §8) — la Story 29.11 n'aura qu'à ajouter un `translateX` local.
   *  Le sens est appliqué DANS le repère pivoté, donc toujours accordé à θ. */
  protected cometTransform(comet: EmeraudeBanner['comets'][number]): string {
    return `translate(${comet.x} ${comet.y}) rotate(${comet.angle}) scale(${comet.direction} 1)`;
  }

  protected gearTransform(gear: SteampunkBanner['gears'][number]): string {
    return `translate(${gear.x} ${gear.y}) scale(${gear.size / 100})`;
  }
}
