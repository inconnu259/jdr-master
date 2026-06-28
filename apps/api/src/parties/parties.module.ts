import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';

@Module({
  imports: [AvailabilityModule],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService], // réutilisé par InvitationsModule (vérifs MJ / appartenance)
})
export class PartiesModule {}
