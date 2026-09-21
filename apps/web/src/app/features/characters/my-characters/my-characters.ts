import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import type { CharacterSort, ListViewMode, MyCharacterDto } from '@master-jdr/shared';
import { CHARACTER_SORTS } from '@master-jdr/shared';
import { CharacterService } from '../../../core/characters/character.service';
import { characterName } from '../../../core/characters/character.util';
import { sortCharacters } from '../../../core/characters/character-sort';
import { CharacterSummaryCard } from '../character-summary-card/character-summary-card';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountService } from '../../../core/account/account.service';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { PartySignalsService } from '../../../core/parties/party-signals.service';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';
import {
  ListControlBar,
  type ListControlBarSortOption,
} from '../../../shared/list-control-bar/list-control-bar';
import {
  CharacterCreationEntries,
  type CharacterCreationEntry,
} from './character-creation-entries/character-creation-entries';

@Component({
  selector: 'app-my-characters',
  imports: [MatIconModule, CharacterSummaryCard, ListControlBar, CharacterCreationEntries],
  templateUrl: './my-characters.html',
  styleUrl: './my-characters.scss',
})
export class MyCharacters implements OnInit {
  private readonly characters = inject(CharacterService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeToneService);
  private readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);
  private readonly contextualNav = inject(ContextualNavService);
  private readonly partySignals = inject(PartySignalsService);
  private readonly myParties = inject(MyPartiesService);

  protected readonly all = signal<MyCharacterDto[]>([]);
  protected readonly query = signal('');

  protected readonly sortOptions = CHARACTER_SORTS;
  /** Critère de tri effectif (Story 29.9, AC1/AC4) — même patron que `Dashboard.partiesSort`. */
  protected readonly charactersSort = computed<CharacterSort>(
    () => this.auth.currentUser()?.charactersSort ?? 'partie',
  );
  /** Mode d'affichage effectif (Story 29.9, AC1/AC3) — même patron que `Dashboard.partiesViewMode`. */
  protected readonly charactersViewMode = computed<ListViewMode>(
    () => this.auth.currentUser()?.charactersViewMode ?? 'medium',
  );
  protected readonly sortOptionsForBar = computed<ListControlBarSortOption[]>(() =>
    this.sortOptions.map((sort) => ({ value: sort, label: this.sortLabel(sort) })),
  );
  /** Aucun réglage transitoire sur cet écran une fois `ListControlBar` en place — la recherche est
   *  une saisie de consultation, pas un réglage (AC6). `partiesSort`/`viewMode` équivalents pour
   *  les personnages se persistent immédiatement à chaque changement (même raisonnement que
   *  `Dashboard`) : la pastille de résumé n'est donc jamais affichée sur cette liste. */
  protected readonly hasDeviatedFromDefault = false;
  protected readonly gridDensityClass = computed(() => `list--${this.charactersViewMode()}`);

  // AC4 : filtrage en direct sur le nom du personnage — même convention d'identité que l'épic 28
  // (characterName(), pas de réimplémentation locale du fallback « Personnage sans nom »).
  private readonly searchFiltered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.all();
    if (!q) return list;
    return list.filter((c) => characterName(c).toLowerCase().includes(q));
  });
  /** Tri (Task 4) appliqué après le filtrage par recherche existant, ne le remplace pas. */
  protected readonly filtered = computed(() =>
    sortCharacters(this.searchFiltered(), this.charactersSort()),
  );

  protected sortLabel(sort: CharacterSort): string {
    return this.theme.tone()[`my_characters.sort_${sort}`] ?? sort;
  }

  /** Section « À forger » (Story 29.16) — croise le signal serveur `PERSONNAGE_A_CREER`
   *  (`PartySignalsService.signals`, seule source de vérité de l'éligibilité, jamais recalculée
   *  ici) avec `MyPartiesService.allParties()` pour retrouver nom et `gameSystemId`, absents du
   *  DTO de signal. Ordre = ordre par défaut de `allParties()`, en une seule pile. */
  protected readonly creationEntries = computed<CharacterCreationEntry[]>(() => {
    const signals = this.partySignals.signals();
    return this.myParties
      .allParties()
      .filter((p) => signals.get(p.id)?.signals.includes('PERSONNAGE_A_CREER') ?? false)
      .map((p) => ({ partieId: p.id, gameSystemId: p.gameSystemId, partieName: p.name }));
  });

  /** Passe à `true` une fois le `refresh()` de `ngOnInit` résolu (succès ou échec) — évite que
   *  `emptyMessageKey` clignote de `my_characters.empty` vers `empty_with_entries` si
   *  `characterSvc.listMine()` résout avant les signaux (deux appels réseau non coordonnés).
   *  Même principe que l'« absence de squelette » déjà posé pour la section elle-même : pas d'état
   *  transitoire trompeur pendant le chargement initial. */
  protected readonly creationDataLoaded = signal(false);

  protected readonly emptyMessageKey = computed<string>(() =>
    this.creationDataLoaded() && this.creationEntries().length > 0
      ? 'my_characters.empty_with_entries'
      : 'my_characters.empty',
  );

  async ngOnInit(): Promise<void> {
    this.contextualNav.set({ title: this.theme.tone()['my_characters.title'] });
    // Rafraîchit les signaux à l'activation de la route (Story 29.16) : minimum temps réel exigé
    // par l'AC « retour du wizard après création » — `notifyChanged()` (SSE `user:{id}`) ne suffit
    // pas seul, l'utilisateur peut revenir avant tout événement temps réel.
    void this.partySignals.refresh().finally(() => this.creationDataLoaded.set(true));
    try {
      this.all.set(await this.characters.listMine());
    } catch {
      this.all.set([]);
    }
  }

  open(c: MyCharacterDto): void {
    void this.router.navigate(['/parties', c.partieId, 'characters', c.id]);
  }

  /** Tri (Story 29.9, AC3) — même patron fire-and-forget + rollback que `Dashboard.onSortChange()`. */
  protected onSortChange(sort: CharacterSort): void {
    const previous = this.auth.currentUser();
    if (previous) this.auth.currentUser.set({ ...previous, charactersSort: sort });
    this.account.updatePreferences({ charactersSort: sort }).catch(() => {
      if (previous) this.auth.currentUser.set(previous);
    });
  }

  /** Mode d'affichage (Story 29.9, AC1/AC3) — même patron fire-and-forget + rollback. */
  protected onViewModeChange(mode: ListViewMode): void {
    const previous = this.auth.currentUser();
    if (previous) this.auth.currentUser.set({ ...previous, charactersViewMode: mode });
    this.account.updatePreferences({ charactersViewMode: mode }).catch(() => {
      if (previous) this.auth.currentUser.set(previous);
    });
  }
}
