import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { AvailableSlotDto, DaySlot, SessionPollDto } from '@master-jdr/shared';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

interface CustomSlot {
  date: string;
  slot: DaySlot;
}

const POLL_DESYNC_MESSAGE = 'Vote créé mais introuvable dans la séance retournée';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soirée',
  FULL_DAY: 'Journée',
};

@Component({
  selector: 'app-poll-creation',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule],
  templateUrl: './poll-creation.html',
  styleUrl: './poll-creation.scss',
})
export class PollCreationComponent {
  readonly partieId = input.required<string>();
  readonly preselectedSlots = input<AvailableSlotDto[]>([]);
  // Story 8.7 (AC1, corrigé en revue) : un vote de date exige toujours une séance — verrouillé en
  // amont par SeanceList → CalendarView (queryParam `seanceId`), jamais un texte libre saisi ici
  // (remplace le champ scenarioRef mort, jamais exploité) ni un vote sans séance.
  readonly seanceId = input.required<string>();

  readonly created = output<SessionPollDto>();
  readonly cancelled = output<void>();

  private readonly scenariosSvc = inject(ScenariosService);
  protected readonly theme = inject(ThemeToneService);
  private readonly snack = inject(MatSnackBar);

  protected readonly checkedSlots = signal<Set<string>>(new Set());
  protected readonly customSlots = signal<CustomSlot[]>([]);
  protected readonly visibleSlotsCount = signal(5);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  readonly SLOT_LABELS = SLOT_LABELS;
  readonly SLOT_OPTIONS: DaySlot[] = ['MORNING', 'AFTERNOON', 'EVENING'];

  protected readonly visiblePreselected = computed(() =>
    this.preselectedSlots().slice(0, this.visibleSlotsCount()),
  );

  protected readonly canLoadMore = computed(
    () => this.visibleSlotsCount() < this.preselectedSlots().length,
  );

  protected readonly nextBatchSize = computed(() =>
    Math.min(4, this.preselectedSlots().length - this.visibleSlotsCount()),
  );

  protected readonly totalSelected = computed(
    () => this.checkedSlots().size + this.customSlots().filter((c) => c.date).length,
  );

  protected readonly isValid = computed(
    () => this.totalSelected() >= 2 && this.totalSelected() <= 40,
  );

  private static slotKey(s: { date: string; slot: DaySlot }): string {
    return `${s.date}|${s.slot}`;
  }

  protected formatSlot(date: string, slot: DaySlot): string {
    const d = new Date(date + 'T00:00:00Z');
    const dateStr = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(d);
    return `${dateStr} — ${SLOT_LABELS[slot]}`;
  }

  protected toggleSlot(index: number): void {
    const slot = this.visiblePreselected()[index];
    if (!slot) return;
    const key = PollCreationComponent.slotKey(slot);
    const s = new Set(this.checkedSlots());
    if (s.has(key)) {
      s.delete(key);
    } else {
      s.add(key);
    }
    this.checkedSlots.set(s);
  }

  protected isSlotChecked(index: number): boolean {
    const slot = this.visiblePreselected()[index];
    return !!slot && this.checkedSlots().has(PollCreationComponent.slotKey(slot));
  }

  protected loadMoreSlots(): void {
    this.visibleSlotsCount.update((n) => Math.min(n + 4, this.preselectedSlots().length));
  }

  protected addOneCustomSlot(): void {
    this.customSlots.update((list) => [
      ...list,
      { date: this.nextDefaultDate(), slot: 'AFTERNOON' as DaySlot },
    ]);
  }

  protected removeCustomSlot(i: number): void {
    this.customSlots.update((list) => list.filter((_, idx) => idx !== i));
  }

  private nextDefaultDate(): string {
    const all = [
      ...this.preselectedSlots().map((s) => s.date),
      ...this.customSlots()
        .map((c) => c.date)
        .filter(Boolean),
    ].sort();
    const latest = all.at(-1);
    const d = latest
      ? new Date(latest + 'T00:00:00Z')
      : new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
        );
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().substring(0, 10);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isValid() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const checked = this.checkedSlots();
      const candidates = [
        ...this.preselectedSlots()
          .filter((s) => checked.has(PollCreationComponent.slotKey(s)))
          .map((s) => ({ date: s.date, slot: s.slot })),
        ...this.customSlots()
          .filter((c) => c.date)
          .map((c) => ({
            date: c.date,
            slot: c.slot,
          })),
      ];
      // Un créneau personnalisé peut coïncider avec un créneau pré-sélectionné coché (même
      // date+slot) — dédoublonner ici plutôt que de laisser l'API rejeter la requête (AC3) avec
      // un message générique et déroutant pour l'utilisateur.
      const seen = new Set<string>();
      const options = candidates.filter((o) => {
        const key = PollCreationComponent.slotKey(o);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Story 8.7, AC1 : point d'entrée unique — un seul appel crée le vote ET le lie à la séance
      // (ScenariosService.createSeancePoll), CreatePollDto/PollService.create() inchangés. Plus
      // aucun chemin ne crée de vote sans séance (corrigé en revue de code, cf. Story 8-8 pour
      // l'extension à l'épisodique et la refonte de la vue Oracle multi-votes).
      const sid = this.seanceId();
      const scenario = await this.scenariosSvc.createSeancePoll(sid, options);
      const linked = scenario.seances.find((s) => s.id === sid)?.poll;
      if (!linked) throw new Error(POLL_DESYNC_MESSAGE);

      this.snack.open(this.theme.tone()['success.poll_created'], undefined, { duration: 3000 });
      this.created.emit(linked);
    } catch (err) {
      // Distingue le cas « vote bien créé côté serveur mais introuvable dans la réponse » d'une
      // vraie panne réseau/validation — le même message générique inviterait à relancer une
      // soumission et créerait un doublon (revue de code Story 8.7).
      this.error.set(
        err instanceof Error && err.message === POLL_DESYNC_MESSAGE
          ? 'Le vote a été créé, mais son état n’a pas pu être rafraîchi ici. Rechargez la page pour le voir plutôt que de recréer un vote.'
          : 'Impossible de créer le vote. Réessayez.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
