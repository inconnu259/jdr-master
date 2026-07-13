import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import type { ScenarioDto } from '@master-jdr/shared';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ScenarioStatusBadge } from '../scenario-status-badge/scenario-status-badge';
import { ScenarioReadDialog, type ScenarioReadDialogData } from '../scenario-read-dialog/scenario-read-dialog';

export interface TimelineNode {
  key: string;
  scenarios: ScenarioDto[];
}

const DESKTOP_QUERY = '(min-width: 768px)';
/** Distance de souris (px) au-delà de laquelle un mouseup ne doit plus ouvrir le dialogue (glisser, pas cliquer). */
const CLICK_VS_DRAG_THRESHOLD = 4;

function createdAtMs(s: ScenarioDto): number {
  return new Date(s.createdAt).getTime();
}

/**
 * Regroupe les scénarios visibles en nœuds triés chronologiquement. `includeBrouillon` (vue MJ
 * uniquement, AD-6 : jamais pour un joueur) garde les BROUILLON, chacun son propre nœud (jamais
 * fusionné avec le groupe COURANT). Tous les scénarios COURANT simultanés (épisodique) sont
 * fusionnés en un seul nœud empilé (AC5), positionné à la date de création du plus ancien.
 */
function buildNodes(scenarios: ScenarioDto[], includeBrouillon: boolean): TimelineNode[] {
  const visible = includeBrouillon
    ? scenarios
    : scenarios.filter((s) => s.status !== 'BROUILLON');
  const sorted = [...visible].sort((a, b) => createdAtMs(a) - createdAtMs(b));

  const nodes: TimelineNode[] = [];
  const courantGroup: ScenarioDto[] = [];
  for (const s of sorted) {
    if (s.status === 'COURANT') {
      courantGroup.push(s);
    } else {
      nodes.push({ key: s.id, scenarios: [s] });
    }
  }
  if (courantGroup.length > 0) {
    nodes.push({ key: `courant-${courantGroup[0].id}`, scenarios: courantGroup });
  }
  nodes.sort((a, b) => createdAtMs(a.scenarios[0]) - createdAtMs(b.scenarios[0]));
  return nodes;
}

@Component({
  selector: 'app-scenario-timeline',
  imports: [ScenarioStatusBadge],
  templateUrl: './scenario-timeline.html',
  styleUrl: './scenario-timeline.scss',
})
export class ScenarioTimeline {
  private readonly scenariosService = inject(ScenariosService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);

  readonly partieId = input.required<string>();
  /** Vue MJ : affiche aussi les BROUILLON (jamais pour un joueur, AD-6), stylés distinctement. */
  readonly isMj = input(false);

  protected readonly isDesktop = toSignal(
    this.breakpointObserver.observe(DESKTOP_QUERY).pipe(map((r) => r.matches)),
    { initialValue: this.breakpointObserver.isMatched(DESKTOP_QUERY) },
  );

  private readonly scenarios = signal<ScenarioDto[]>([]);
  protected readonly loadError = signal<string | null>(null);

  protected readonly nodes = computed(() => buildNodes(this.scenarios(), this.isMj()));

  protected readonly track = viewChild<ElementRef<HTMLElement>>('track');
  protected readonly fadeStart = signal(false);
  protected readonly fadeEnd = signal(false);
  protected readonly dragging = signal(false);
  private dragStartX = 0;
  private dragStartScrollLeft = 0;
  private dragMoved = false;
  private anchoredOnce = false;
  // Incrémenté à chaque appel de loadScenarios() — permet d'ignorer une réponse HTTP obsolète qui
  // résoudrait après une réponse plus récente (deux changed() rapprochés, ex. deux champs modifiés
  // coup sur coup), pour ne jamais laisser une réponse périmée écraser un état plus à jour.
  private loadGeneration = 0;

  constructor() {
    // Recharge au montage ET à chaque mutation notifiée par ScenariosService (create/update/open
    // déclenchés depuis un autre onglet Angular Material de la même page, ex. ScenarioDrafts — pas
    // un onglet navigateur, qu'un simple signal ne peut pas synchroniser) — évite d'exiger un F5
    // pour voir un scénario nouvellement créé ou ouvert aux joueurs apparaître ici.
    effect(() => {
      const partieId = this.partieId();
      this.scenariosService.changed();
      untracked(() => this.loadScenarios(partieId));
    });

    // S'exécute après chaque rendu où track()/nodes()/isDesktop() changent — couvre le cas où les
    // données arrivent après le premier rendu (chargement asynchrone).
    effect(() => {
      const trackEl = this.track()?.nativeElement;
      const nodeList = this.nodes();
      if (!trackEl || !this.isDesktop() || nodeList.length === 0) return;

      // Initialise les fondus dès que le contenu est disponible, pas seulement au premier scroll.
      queueMicrotask(() => this.updateFades());

      // Ancrage sur le COURANT une seule fois (AC6 : "à son premier affichage") — un recalcul
      // ultérieur de nodes()/isDesktop() ne doit pas re-tirer le scroll de l'utilisateur.
      if (this.anchoredOnce) return;
      const courantIndex = nodeList.findIndex((n) =>
        n.scenarios.some((s) => s.status === 'COURANT'),
      );
      if (courantIndex === -1) return;

      queueMicrotask(() => {
        const nodeEl = trackEl.querySelectorAll<HTMLElement>('.node')[courantIndex];
        nodeEl?.scrollIntoView({ inline: 'center', behavior: 'auto' });
        this.anchoredOnce = true;
      });
    });
  }

  private async loadScenarios(partieId: string): Promise<void> {
    const generation = ++this.loadGeneration;
    try {
      const scenarios = await this.scenariosService.listAll(partieId);
      if (generation !== this.loadGeneration) return; // réponse obsolète, une requête plus récente est en vol
      this.scenarios.set(scenarios);
      this.loadError.set(null);
    } catch {
      if (generation !== this.loadGeneration) return;
      this.loadError.set('Impossible de charger la chronologie. Réessayez.');
    }
  }

  protected openDetail(scenario: ScenarioDto): void {
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    // MJ + BROUILLON/A_VENIR : direction la fiche d'édition (comme depuis ScenarioDrafts), jamais le
    // dialogue anti-spoil lecture seule — le MJ est l'auteur du scénario, il n'a rien à se cacher à
    // lui-même, et A_VENIR est le statut où vit le CTA « Marquer comme Courant » (Story 7.6, AC8).
    // COURANT/PASSE restent ouverts via ScenarioReadDialog même pour le MJ (pas de vue MJ dédiée
    // pour ces statuts dans cette story).
    if (this.isMj() && (scenario.status === 'BROUILLON' || scenario.status === 'A_VENIR')) {
      void this.router.navigate(['/parties', this.partieId(), 'scenarios', scenario.id], {
        state: { scenario },
      });
      return;
    }
    this.dialog.open<ScenarioReadDialog, ScenarioReadDialogData, void>(ScenarioReadDialog, {
      data: { scenario },
    });
  }

  protected onCardKeydown(event: KeyboardEvent, scenario: ScenarioDto): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openDetail(scenario);
  }

  protected onNodeFocus(index: number): void {
    const trackEl = this.track()?.nativeElement;
    if (!trackEl) return;
    const nodeEl = trackEl.querySelectorAll<HTMLElement>('.node')[index];
    nodeEl?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }

  protected onWheel(event: WheelEvent): void {
    const trackEl = this.track()?.nativeElement;
    if (!trackEl) return;
    event.preventDefault();
    // Un swipe trackpad horizontal fournit deltaX (deltaY≈0) ; une molette verticale classique
    // fournit deltaY — on privilégie deltaX quand il est présent pour ne pas casser le geste natif.
    trackEl.scrollLeft += event.deltaX !== 0 ? event.deltaX : event.deltaY;
    this.updateFades();
  }

  protected onScroll(): void {
    this.updateFades();
  }

  private updateFades(): void {
    const trackEl = this.track()?.nativeElement;
    if (!trackEl) return;
    this.fadeStart.set(trackEl.scrollLeft > 0);
    this.fadeEnd.set(trackEl.scrollLeft < trackEl.scrollWidth - trackEl.clientWidth);
  }

  protected onMouseDown(event: MouseEvent): void {
    const trackEl = this.track()?.nativeElement;
    if (!trackEl) return;
    event.preventDefault(); // évite la sélection de texte native pendant le glisser-déposer
    this.dragging.set(true);
    this.dragMoved = false;
    this.dragStartX = event.clientX;
    this.dragStartScrollLeft = trackEl.scrollLeft;
  }

  protected onMouseMove(event: MouseEvent): void {
    if (!this.dragging()) return;
    const trackEl = this.track()?.nativeElement;
    if (!trackEl) return;
    const delta = event.clientX - this.dragStartX;
    if (Math.abs(delta) > CLICK_VS_DRAG_THRESHOLD) this.dragMoved = true;
    trackEl.scrollLeft = this.dragStartScrollLeft - delta;
    this.updateFades();
  }

  // Écoute au niveau document (pas seulement sur .track) : relâcher le bouton ou continuer à
  // déplacer la souris hors des limites du composant ne doit jamais laisser `dragging` bloqué.
  @HostListener('document:mouseup')
  protected onDocumentMouseUp(): void {
    this.dragging.set(false);
  }

  @HostListener('document:mousemove', ['$event'])
  protected onDocumentMouseMove(event: MouseEvent): void {
    this.onMouseMove(event);
  }
}
