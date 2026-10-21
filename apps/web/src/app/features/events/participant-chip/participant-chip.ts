import { Component, computed, inject, input } from '@angular/core';
import type { EventParticipantDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { fillTone } from '../../../core/theme/tone-format';
import { initialsOf, isPendingParticipant } from '../event-card.util';

/**
 * Participant d'une conjonction (Story 40.2, UX-DR11/19/20) : disque d'avatar de 26 px (initiales) et
 * nom ; la pastille de la personne connectée est cerclée de l'accent-1 ET dit « vous » en toutes
 * lettres. ⚠️ Un administrateur du groupe porte un écu de 14 px à l'angle de son avatar ET le mot
 * « Admin » (jamais le seul pictogramme) — dessin tiré de la proposition UX, à relire avec
 * l'utilisateur.
 *
 * Story 40.4 : une place seulement RÉSERVÉE (que l'hôte est seul à recevoir) prend la variante en
 * attente — pastille pointillée, avatar estompé — et dit son état en toutes lettres, à pleine lecture :
 * « *Nom* — invité·e, n'a pas encore accepté ». Le texte n'est jamais estompé (≥ 4,5:1) : seul le
 * disque d'avatar, décoratif, l'est.
 */
@Component({
  selector: 'app-participant-chip',
  templateUrl: './participant-chip.html',
  styleUrl: './participant-chip.scss',
})
export class ParticipantChip {
  protected readonly theme = inject(ThemeToneService);

  readonly participant = input.required<EventParticipantDto>();
  /** La pastille est celle de la personne connectée. */
  readonly self = input(false);

  protected readonly initials = computed(() => initialsOf(this.participant().displayName));
  protected readonly pending = computed(() => isPendingParticipant(this.participant()));
  protected readonly pendingText = computed(() =>
    fillTone(this.theme.tone()['partie.ralliement_event_pending_text'], {
      name: this.participant().displayName,
    }),
  );
}
