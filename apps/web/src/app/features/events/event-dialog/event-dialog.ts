import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { EventCardDto, EventParticipantDto, PartieMemberDto } from '@master-jdr/shared';
import { PartiesService } from '../../../core/parties/parties.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { fillTone } from '../../../core/theme/tone-format';
import { DetailSurface } from '../../../shared/detail-surface/detail-surface';
import { StatusBadge } from '../../../shared/status-badge/status-badge';
import {
  canManageReservations,
  canRespondToReservation,
  canSignUp,
  canUnsubscribe,
  eventBadge,
  eventDateLabel,
  eventSituationTextKey,
  isFull,
  isFullForViewer,
  isHostOf,
  isPastEvent,
  isPendingParticipant,
  participationLine,
} from '../event-card.util';
import { EventForm } from '../event-form/event-form';
import { EventsApiService } from '../events-api.service';
import { ParticipantChip } from '../participant-chip/participant-chip';
import { refusalMessage } from '../refusal-message';

let nextUid = 0;

/**
 * Fenêtre d'une conjonction (Story 40.2, EventDialog) sur la `DetailSurface` en variante LARGE
 * (⚠️ contrat UX). Ordre du contrat : titre (nom de la conjonction) + badge → panneau de situation
 * (la situation de la personne, puis date, heure et lieu en grand — pas de vote à ce palier) →
 * fiche (date, hôte, lieu, heure, participation, infos pratiques ; lignes facultatives vides omises)
 * → participants → pied. Pied : l'hôte voit « Modifier » tant que la conjonction n'est pas passée,
 * puis « Refermer ».
 *
 * Story 40.3 : le panneau de situation offre « S'inscrire » à un membre non inscrit (et pas l'hôte)
 * tant que la conjonction est à venir — remplacé par « Complet », écrit, quand il n'y a plus de
 * place — et le pied offre « Me désinscrire » à un inscrit (pas l'hôte). Les boutons sont gardés
 * contre le double clic (`busy`), le refus du serveur (complet, passée) s'affiche dans la fenêtre,
 * et la carte à jour est remise à l'onglet (`saved`) : participants, chip et ligne de participation
 * se lisent ensuite dans la liste vivante, comme pour tout changement reçu en direct.
 *
 * Story 40.4 : la personne à qui une place est réservée voit, dans le panneau de situation, « Accepter »
 * et « Décliner » (gardés contre le double clic, refus du serveur affiché dans la fenêtre) ; refuser
 * passe par la désinscription, qui libère la place. L'hôte, tant que la conjonction à places limitées
 * n'est pas passée, voit sous les participants le sélecteur « Réserver une place à des membres »
 * (un clic sur un membre lui réserve une place) et, sur chaque réservation en attente — affichée en
 * pastille pointillée — une action « Retirer la réservation ». Les membres du groupe sont lus une seule
 * fois, à l'ouverture.
 *
 * La carte vient de la liste vivante de l'onglet (lue par identifiant) : toute mise à jour reçue en
 * temps réel se reflète ici sans rechargement. « Modifier » bascule la MÊME fenêtre en mode édition
 * (les champs de la création, via `EventForm`), pied « Renoncer » · « Enregistrer » ; le refus du
 * serveur s'affiche dans la fenêtre. Le focus est piégé par la `DetailSurface` ; le retour du focus
 * sur la carte est l'affaire de l'onglet.
 */
@Component({
  selector: 'app-event-dialog',
  imports: [MatButtonModule, DetailSurface, StatusBadge, ParticipantChip, EventForm],
  templateUrl: './event-dialog.html',
  styleUrl: './event-dialog.scss',
})
export class EventDialog {
  protected readonly theme = inject(ThemeToneService);
  private readonly api = inject(EventsApiService);
  private readonly parties = inject(PartiesService);

  readonly partieId = input.required<string>();
  readonly card = input.required<EventCardDto>();
  /** Clé `YYYY-MM-DD` du jour courant, figée par l'écran parent. */
  readonly todayKey = input.required<string>();
  readonly currentUserId = input<string | null>(null);
  /** Carte à jour renvoyée par le serveur (modification par l'hôte, inscription, désinscription) :
   *  l'onglet la met à jour tout de suite. */
  readonly saved = output<EventCardDto>();
  readonly closed = output<void>();

  protected readonly uid = `event-dialog-${++nextUid}`;
  private readonly form = viewChild(EventForm);

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Membres du groupe (hôte seulement, lus une fois) : source du sélecteur de places réservées. */
  private readonly members = signal<PartieMemberDto[]>([]);
  private membersRequested = false;

  constructor() {
    effect(() => {
      if (this.canReserve() && !this.membersRequested) {
        this.membersRequested = true;
        untracked(() => void this.loadMembers());
      }
    });
  }

  protected readonly past = computed(() => isPastEvent(this.card(), this.todayKey()));
  protected readonly canEdit = computed(
    () => isHostOf(this.card(), this.currentUserId()) && !this.past(),
  );
  protected readonly badge = computed(() =>
    eventBadge(this.card(), this.todayKey(), this.theme.tone(), this.currentUserId()),
  );
  protected readonly showSignUp = computed(() =>
    canSignUp(this.card(), this.currentUserId(), this.todayKey()),
  );
  /** « Complet », écrit, à la place de « S'inscrire » : seulement pour qui n'est pas inscrit. */
  protected readonly showFull = computed(() =>
    isFullForViewer(this.card(), this.currentUserId(), this.todayKey()),
  );
  protected readonly showUnsubscribe = computed(() =>
    canUnsubscribe(this.card(), this.currentUserId(), this.todayKey()),
  );
  /** Story 40.4 : « Accepter » / « Décliner » pour qui tient une place réservée. */
  protected readonly showRespond = computed(() =>
    canRespondToReservation(this.card(), this.todayKey()),
  );
  /** Story 40.4 : l'hôte gère les réservations (places limitées, pas passée). */
  protected readonly canReserve = computed(() =>
    canManageReservations(this.card(), this.currentUserId(), this.todayKey()),
  );
  /** Membres à qui une place peut encore être réservée : ni l'hôte, ni quiconque a déjà une ligne
   *  (l'hôte voit toutes les lignes, réservées comprises, dans les participants). */
  protected readonly candidates = computed(() => {
    const taken = new Set(this.card().participants.map((p) => p.userId));
    return this.members().filter((m) => m.userId !== this.card().hostId && !taken.has(m.userId));
  });
  /** Plus aucune place à réserver : les pastilles sont désactivées. */
  protected readonly noPlaceLeft = computed(() => isFull(this.card()));
  protected readonly dateLabel = computed(() => eventDateLabel(this.card(), this.theme.tone()));
  protected readonly situationText = computed(
    () =>
      this.theme.tone()[eventSituationTextKey(this.card(), this.currentUserId(), this.todayKey())],
  );
  protected readonly timeText = computed(() => {
    const time = this.card().seance?.heureRdv;
    return time
      ? fillTone(this.theme.tone()['partie.ralliement_event_panel_time'], { time })
      : null;
  });
  protected readonly participation = computed(() =>
    participationLine(this.card(), this.theme.tone()),
  );
  protected readonly windowTitle = computed(() =>
    this.editing() ? this.theme.tone()['partie.ralliement_event_edit_title'] : this.card().title,
  );
  protected readonly canSave = computed(() => !this.busy() && !!this.form()?.valid());

  protected startEdit(): void {
    this.error.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.error.set(null);
    this.editing.set(false);
  }

  /** Story 40.3 : s'inscrire. Le serveur est seul juge (complet, passée) ; son refus s'affiche ici. */
  protected async signUp(): Promise<void> {
    await this.changeRoster(
      (seanceId) => this.api.inscrire(seanceId),
      'partie.ralliement_event_signup_error',
    );
  }

  /** Story 40.3 : se désinscrire (libre tant que la conjonction n'est pas passée). */
  protected async unsubscribe(): Promise<void> {
    await this.changeRoster(
      (seanceId) => this.api.desinscrire(seanceId),
      'partie.ralliement_event_unsubscribe_error',
    );
  }

  /** Story 40.4 : accepter la place réservée. */
  protected async accept(): Promise<void> {
    await this.changeRoster(
      (seanceId) => this.api.accepter(seanceId),
      'partie.ralliement_event_accept_error',
    );
  }

  /** Story 40.4 : décliner la place réservée — la ligne est supprimée, la place est libre. */
  protected async decline(): Promise<void> {
    await this.changeRoster(
      (seanceId) => this.api.desinscrire(seanceId),
      'partie.ralliement_event_decline_error',
    );
  }

  /** Story 40.4 : l'hôte réserve une place à `member`. Le serveur est seul juge (complet, déjà inscrit). */
  protected async reserve(member: PartieMemberDto): Promise<void> {
    await this.changeRoster(
      (seanceId) => this.api.reserver(seanceId, member.userId),
      'partie.ralliement_event_reserve_error',
    );
  }

  /** Story 40.4 : l'hôte retire la réservation en attente de `participant`. */
  protected async unreserve(participant: EventParticipantDto): Promise<void> {
    await this.changeRoster(
      (seanceId) => this.api.retirerReservation(seanceId, participant.userId),
      'partie.ralliement_event_unreserve_error',
    );
  }

  protected isPending(participant: EventParticipantDto): boolean {
    return isPendingParticipant(participant);
  }

  protected reserveAria(member: PartieMemberDto): string {
    return fillTone(this.theme.tone()['partie.ralliement_event_reserve_chip_aria'], {
      name: member.displayName,
    });
  }

  protected unreserveAria(participant: EventParticipantDto): string {
    return fillTone(this.theme.tone()['partie.ralliement_event_unreserve_aria'], {
      name: participant.displayName,
    });
  }

  private async loadMembers(): Promise<void> {
    try {
      this.members.set(await this.parties.members(this.partieId()));
    } catch {
      // Sans la liste, le sélecteur reste vide : réserver n'est pas bloquant pour le reste de la fenêtre.
      this.members.set([]);
    }
  }

  private async changeRoster(
    call: (seanceId: string) => Promise<EventCardDto>,
    errorKey: string,
  ): Promise<void> {
    const seanceId = this.card().seance?.id;
    if (!seanceId || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.saved.emit(await call(seanceId));
    } catch (err) {
      this.error.set(refusalMessage(err, this.theme.tone()[errorKey]));
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    const form = this.form();
    if (!form || !this.canSave()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const card = await this.api.update(this.partieId(), this.card().id, form.dto());
      this.saved.emit(card);
      this.editing.set(false);
    } catch (err) {
      this.error.set(
        refusalMessage(err, this.theme.tone()['partie.ralliement_event_update_error']),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
