import { Global, Module } from '@nestjs/common';
import { OCCUPIED_SPANS_PORT } from '../availability/ports/occupied-spans.port';
import { OWN_EVENTS_PORT } from '../availability/ports/own-events.port';
import { EventsModule } from '../events/events.module';
import { EventsService } from '../events/events.service';
import { PartiesModule } from '../parties/parties.module';
import { PartiesService } from '../parties/parties.service';
import { GroupPollChoiceService } from '../events/group-poll-choice.service';
import { GROUP_POLL_CHOOSE_PORT } from '../poll/ports/group-poll-choose.port';
import { GROUP_POLL_VOTE_PORT } from '../poll/ports/group-poll-vote.port';
import { PARTIE_SIGNALS_PORT } from '../poll/ports/partie-signals.port';
import { SEANCE_DATE_PORT } from '../poll/ports/seance-date.port';

/**
 * Composition des ports de la couche 1 (Story 37.8, AD-8) — LE seul endroit où la planification
 * (`availability/`, `poll/`) rencontre les couches qui l'implémentent. Les modules de la couche 1
 * ne déclarent que des interfaces + jetons d'injection (dossiers `ports/`) ; ce module global lie
 * chaque jeton à son implémentation (`useExisting` : jamais une seconde instance), de sorte que
 * `AvailabilityModule` et `PollModule` n'importent plus `PartiesModule`, `EventsModule` ni
 * `ScenariosModule`.
 *
 * - `OccupiedSpansPort`, `OwnEventsPort`, `SeanceDatePort`, `GroupPollVotePort` (Story 40.5) →
 *   `EventsService` ;
 * - `GroupPollChoosePort` (Story 40.6) → `GroupPollChoiceService` ;
 * - `PartieSignalsPort` → `PartiesService`.
 */
@Global()
@Module({
  imports: [EventsModule, PartiesModule],
  providers: [
    { provide: OCCUPIED_SPANS_PORT, useExisting: EventsService },
    { provide: OWN_EVENTS_PORT, useExisting: EventsService },
    { provide: SEANCE_DATE_PORT, useExisting: EventsService },
    { provide: GROUP_POLL_VOTE_PORT, useExisting: EventsService },
    { provide: GROUP_POLL_CHOOSE_PORT, useExisting: GroupPollChoiceService },
    { provide: PARTIE_SIGNALS_PORT, useExisting: PartiesService },
  ],
  exports: [
    OCCUPIED_SPANS_PORT,
    OWN_EVENTS_PORT,
    SEANCE_DATE_PORT,
    GROUP_POLL_VOTE_PORT,
    GROUP_POLL_CHOOSE_PORT,
    PARTIE_SIGNALS_PORT,
  ],
})
export class PortsModule {}
