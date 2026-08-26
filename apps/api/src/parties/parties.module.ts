import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';
import { PartyCoverController } from './party-cover.controller';
import { PartySignalsService } from './party-signals.service';
import { MyPartySignalsController } from './my-party-signals.controller';

@Module({
  imports: [AvailabilityModule],
  controllers: [PartiesController, PartyCoverController, MyPartySignalsController],
  providers: [PartiesService, PartySignalsService],
  exports: [PartiesService], // réutilisé par InvitationsModule (vérifs MJ / appartenance)
})
export class PartiesModule {}
