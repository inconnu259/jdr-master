import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ContentEntryDto, HommeDragonDto, HommeDragonRace } from '@master-jdr/shared';
import { reserveCapacity } from '@master-jdr/game-rules';
import { HommeDragonService } from '../../../core/homme-dragon/homme-dragon.service';
import { RACE_TAGS } from '../homme-dragon-races';
import { ReservePicker } from '../reserve-picker/reserve-picker';
import { emplacements, souffleView } from './reserve-souffle.util';

/** Durée d'affichage de l'annulation du dernier retrait (valeur à fixer par l'implémentation :
 *  6 s, valeur d'exemple de la planche). Le décompte est suspendu tant que le focus ou le survol
 *  est sur le bandeau (WCAG 2.2.1). */
export const UNDO_DELAY_MS = 6000;

let nextInstance = 0;

type Gesture = 'place' | 'remove' | 'undo';

/**
 * Section « Réserve de souffles » de la fiche de l'Homme Dragon (Story 33.6) — MJ seul (la fiche
 * entière lui est réservée). Une seule réserve par dragon, portée par sa fiche : N − 1 emplacements
 * numérotés dès le niveau 2, enregistrés à chaque geste (un seul en vol), sans décompte.
 *
 * L'écriture est OPTIMISTE : l'emplacement change aussitôt (`overlay`), puis revient à son état
 * précédent si le serveur refuse ou échoue. Tant qu'un geste est en vol, un rafraîchissement de la
 * fiche (signal temps réel `changed` géré par la fiche) ne l'écrase pas : la composition affichée
 * est l'`overlay`, et une fiche reçue plus ancienne que la dernière réponse d'écriture est ignorée
 * (`updatedAt`). Le câblage temps réel est donc celui de la fiche (`changed` → `findOne`), qui
 * repasse la fiche fraîche à cette section en entrée : aucune connexion supplémentaire.
 *
 * Focus (EXPERIENCE §6) : toujours posé APRÈS le rendu (`afterNextRender`), jamais sur `<body>` —
 * le bouton « Choisir un souffle » devient « Changer »/« Retirer » une fois le souffle placé.
 */
@Component({
  selector: 'app-reserve-section',
  imports: [ReservePicker],
  templateUrl: './reserve-section.html',
  styleUrl: './reserve-section.scss',
})
export class ReserveSection {
  readonly partieId = input.required<string>();
  /** Fiche courante (rafraîchie par la fiche parente) — niveau, race et réserve en sont lus. */
  readonly hommeDragon = input.required<HommeDragonDto>();
  readonly souffleCatalog = input<ContentEntryDto[]>([]);
  readonly ritualCatalog = input<ContentEntryDto[]>([]);
  /** Fiche à jour renvoyée par le serveur après un geste enregistré. */
  readonly updated = output<HommeDragonDto>();

  private readonly svc = inject(HommeDragonService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly uid = `reserve-${nextInstance++}`;

  /** Dernière réponse d'écriture : prime sur la fiche reçue si elle est plus récente. */
  private readonly written = signal<HommeDragonDto | null>(null);

  protected readonly dto = computed<HommeDragonDto>(() => {
    const received = this.hommeDragon();
    const written = this.written();
    return written && Date.parse(written.updatedAt) > Date.parse(received.updatedAt)
      ? written
      : received;
  });

  /** Composition provisoire pendant un geste en vol (écriture optimiste). */
  private readonly overlay = signal<(string | null)[] | null>(null);

  protected readonly reserve = computed<(string | null)[]>(
    () => this.overlay() ?? this.dto().sheetData.reserve ?? [],
  );
  protected readonly level = computed(() => this.dto().derived.level);
  protected readonly capacity = computed(() => reserveCapacity(this.level()));
  protected readonly race = computed<HommeDragonRace>(() => this.dto().sheetData.race);

  protected readonly slots = computed(() => {
    const reserve = this.reserve();
    return Array.from({ length: this.capacity() }, (_, i) => {
      const key = reserve[i] ?? null;
      const view = key ? souffleView(key, this.souffleCatalog(), this.ritualCatalog()) : null;
      const n = i + 1;
      // Le libellé visible (« Changer », « Retirer », « Choisir un souffle ») est contenu dans le
      // nom accessible, qui ajoute le souffle et l'emplacement (WCAG 2.5.3).
      return {
        n,
        key,
        view,
        changeLabel: `Changer le souffle de l'emplacement ${n} : ${view?.label ?? ''}`,
        removeLabel: `Retirer ${view?.label ?? ''} de l'emplacement ${n}`,
        pickLabel: `Choisir un souffle pour l'emplacement ${n}`,
      };
    });
  });

  protected readonly levelText = computed(() => {
    const count = this.capacity();
    return count > 0 ? `Niveau ${this.level()} · ${emplacements(count)}` : `Niveau ${this.level()}`;
  });

  /** Règle rappelée sous les emplacements (planche P1 / P2b). */
  protected readonly rule = computed(() =>
    this.level() < 3
      ? "les souffles d'une autre race s'ouvrent au niveau 3. Un même souffle peut occuper plusieurs emplacements."
      : "un seul souffle d'une autre race au plus. Un même souffle peut occuper plusieurs emplacements.",
  );

  // — Enregistrement —
  protected readonly saving = signal(false);
  /** Une entrée par échec : `@for … track id` recrée le nœud `role="alert"`, qui est ainsi
   *  ré-annoncé à chaque échec, même répété. */
  protected readonly errors = signal<{ id: number }[]>([]);
  private errorSeq = 0;
  /** Zone `role="status"` persistante (annonces non visuelles). */
  protected readonly statusMessage = signal('');

  // — Fenêtre de choix —
  protected readonly picking = signal<{ slot: number } | null>(null);
  private pickerTrigger: HTMLElement | null = null;

  // — Annulation du dernier retrait —
  private readonly undo = signal<{
    slot: number;
    key: string;
    label: string;
    armed: boolean;
  } | null>(null);
  /** Bandeau visible : tant que l'emplacement n'est pas de nouveau occupé. */
  protected readonly undoBanner = computed(() => {
    const u = this.undo();
    return u && !this.reserve()[u.slot - 1] ? u : null;
  });
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private undoRemaining = UNDO_DELAY_MS;
  private undoDeadline = 0;
  private hovering = false;
  private focusWithin = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearUndoTimer());
  }

  protected raceClass(race: HommeDragonRace | null): string {
    return race ? `race-${RACE_TAGS[race].toLowerCase()}` : '';
  }

  // — Gestes —

  protected openPicker(slot: number, event: Event): void {
    if (this.saving()) return;
    this.pickerTrigger = event.currentTarget as HTMLElement;
    this.picking.set({ slot });
  }

  /** « Annuler » de la zone de détail, Échap ou ✕ : rien n'est modifié, le focus retourne au
   *  déclencheur d'origine. */
  protected onPickerClosed(): void {
    const trigger = this.pickerTrigger;
    const slot = this.picking()?.slot;
    this.pickerTrigger = null;
    this.picking.set(null);
    afterNextRender(
      () => {
        if (trigger?.isConnected) trigger.focus();
        else if (slot) this.focusNow(slot);
      },
      { injector: this.injector },
    );
  }

  /** « Mettre dans l'emplacement N » : la fenêtre se ferme, le souffle est enregistré. */
  protected onPicked(key: string): void {
    const picking = this.picking();
    if (!picking || this.saving()) return;
    this.pickerTrigger = null;
    this.picking.set(null);
    void this.write(picking.slot, key, 'place');
  }

  protected remove(slot: number): void {
    const key = this.reserve()[slot - 1];
    if (!key || this.saving()) return;
    void this.write(slot, null, 'remove', key);
  }

  protected undoRemoval(): void {
    const u = this.undoBanner();
    if (!u || !u.armed || this.saving()) return;
    void this.write(u.slot, u.key, 'undo');
  }

  /**
   * Un seul enregistrement en vol. Écriture optimiste : l'emplacement change aussitôt ; en cas
   * d'échec il revient à son état précédent (rien n'est vidé ni écrasé) et le focus à la cible
   * correspondante.
   */
  private async write(
    slot: number,
    key: string | null,
    gesture: Gesture,
    removedKey?: string,
  ): Promise<void> {
    const current = this.reserve();
    const next = Array.from({ length: Math.max(current.length, slot) }, (_, i) =>
      i === slot - 1 ? key : (current[i] ?? null),
    );
    const label = (k: string) => souffleView(k, this.souffleCatalog(), this.ritualCatalog()).label;

    this.saving.set(true);
    this.errors.set([]);
    this.statusMessage.set('Enregistrement…');
    this.overlay.set(next);
    if (gesture === 'remove' && removedKey) {
      // Un nouveau retrait remplace le message précédent ; « Annuler » reste inactif tant que
      // l'écriture n'est pas terminée.
      this.clearUndoTimer();
      this.undo.set({ slot, key: removedKey, label: label(removedKey), armed: false });
    }
    this.focusPrimary(slot);

    try {
      const updated = await this.svc.setReserveSlot(this.partieId(), slot, { key });
      this.written.set(updated);
      this.overlay.set(null);
      this.updated.emit(updated);
      if (gesture === 'remove' && removedKey) {
        this.undo.update((u) => (u ? { ...u, armed: true } : u));
        this.resetUndoTimer();
        this.statusMessage.set(
          `${label(removedKey)} retiré de l'emplacement ${slot}. Annuler disponible pendant quelques secondes.`,
        );
      } else if (gesture === 'undo' && key) {
        this.clearUndo();
        this.statusMessage.set(`${label(key)} remis dans l'emplacement ${slot}`);
      } else if (key) {
        this.statusMessage.set(
          `${label(key)} placé dans l'emplacement ${slot}. Réserve enregistrée`,
        );
      }
    } catch {
      this.overlay.set(null);
      this.errors.set([{ id: ++this.errorSeq }]);
      this.statusMessage.set('');
      // Retrait échoué : aucun bandeau. Annulation échouée : l'emplacement reste vide, sans bandeau.
      if (gesture !== 'place') this.clearUndo();
      this.focusPrimary(slot);
    } finally {
      this.saving.set(false);
    }
  }

  // — Bandeau d'annulation : délai suspendu au focus / survol —

  protected onBannerEnter(): void {
    this.hovering = true;
    this.pauseUndoTimer();
  }

  protected onBannerLeave(): void {
    this.hovering = false;
    this.resumeUndoTimer();
  }

  protected onBannerFocusIn(): void {
    this.focusWithin = true;
    this.pauseUndoTimer();
  }

  protected onBannerFocusOut(): void {
    this.focusWithin = false;
    this.resumeUndoTimer();
  }

  private resetUndoTimer(): void {
    this.clearUndoTimer();
    this.undoRemaining = UNDO_DELAY_MS;
    if (!this.hovering && !this.focusWithin) this.startUndoTimer();
  }

  private startUndoTimer(): void {
    this.undoDeadline = Date.now() + this.undoRemaining;
    this.undoTimer = setTimeout(() => this.expireUndo(), this.undoRemaining);
  }

  private pauseUndoTimer(): void {
    if (this.undoTimer === null) return;
    clearTimeout(this.undoTimer);
    this.undoTimer = null;
    this.undoRemaining = Math.max(this.undoDeadline - Date.now(), 0);
  }

  private resumeUndoTimer(): void {
    if (this.hovering || this.focusWithin) return;
    if (this.undo()?.armed && this.undoTimer === null) this.startUndoTimer();
  }

  private clearUndoTimer(): void {
    if (this.undoTimer !== null) clearTimeout(this.undoTimer);
    this.undoTimer = null;
  }

  private clearUndo(): void {
    this.clearUndoTimer();
    this.undo.set(null);
    this.hovering = false;
    this.focusWithin = false;
  }

  private expireUndo(): void {
    this.undoTimer = null;
    const u = this.undo();
    const banner = this.host.nativeElement.querySelector('.reserve__undo');
    const hadFocus = !!banner && banner.contains(document.activeElement);
    this.clearUndo();
    // « Annuler » avait le focus et va disparaître : retour sur « Choisir un souffle » du même
    // emplacement (jamais sur <body>).
    if (u && hadFocus) this.focusPrimary(u.slot);
  }

  // — Focus —

  /** Bouton principal de l'emplacement dans son état RENDU : « Changer » s'il est rempli,
   *  « Choisir un souffle » sinon. Résolu après le rendu, jamais de façon synchrone. */
  private focusPrimary(slot: number): void {
    afterNextRender(() => this.focusNow(slot), { injector: this.injector });
  }

  private focusNow(slot: number): void {
    this.host.nativeElement
      .querySelector<HTMLElement>(
        `[data-slot="${slot}"][data-reserve-btn="change"], [data-slot="${slot}"][data-reserve-btn="pick"]`,
      )
      ?.focus();
  }
}
