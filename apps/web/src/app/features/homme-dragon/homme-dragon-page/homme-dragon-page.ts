import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { PartieDto } from '@master-jdr/shared';
import { PartiesService } from '../../../core/parties/parties.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { HommeDragonSheet } from '../homme-dragon-sheet/homme-dragon-sheet';

/**
 * Page de la fiche Homme Dragon (Story 33.5) — route `parties/:id/homme-dragon`, atteinte depuis
 * « Personnages » (carte d'un Homme Dragon ou ligne « Créer un Homme Dragon pour … »). Héberge
 * `HommeDragonSheet`, qui rend déjà le parcours de création quand aucune fiche n'existe. L'onglet
 * « Homme Dragon » de `PartieDetail` reste inchangé.
 *
 * Garde : l'Homme Dragon est réservé au MJ d'une partie Ryuutama. Tout autre utilisateur est
 * redirigé vers `/parties/:id` (remplacement d'historique, pour que « Retour » ne reboucle pas).
 * Le serveur reste l'autorité (`getOwned()` sur les écritures) ; ce contrôle évite seulement
 * d'afficher un écran sans objet.
 */
@Component({
  selector: 'app-homme-dragon-page',
  imports: [RouterLink, MatProgressSpinnerModule, HommeDragonSheet],
  templateUrl: './homme-dragon-page.html',
  styleUrl: './homme-dragon-page.scss',
})
export class HommeDragonPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly partiesSvc = inject(PartiesService);
  private readonly auth = inject(AuthService);
  private readonly contextualNav = inject(ContextualNavService);

  protected partieId = '';
  protected readonly partie = signal<PartieDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const p = this.partie();
      if (!p) return;
      this.contextualNav.set({ title: 'Homme Dragon', subtitle: p.name });
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Partie introuvable.');
      this.loading.set(false);
      return;
    }
    this.partieId = id;

    let partie: PartieDto;
    try {
      partie = await this.partiesSvc.get(id);
    } catch {
      this.error.set('Impossible de charger la partie. Réessayez.');
      this.loading.set(false);
      return;
    }

    const isMj = partie.mjId === this.auth.currentUser()?.id;
    if (!isMj || partie.gameSystemId !== 'ryuutama') {
      void this.router.navigate(['/parties', id], { replaceUrl: true });
      return;
    }

    this.partie.set(partie);
    this.loading.set(false);
  }
}
