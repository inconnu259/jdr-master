import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';
import { MeCalendarController } from './me-calendar.controller';

@Module({
  // Story 37.7 : PermissionsModule (transverse) décide du rôle de l'utilisateur sur ses parties.
  imports: [PermissionsModule],
  controllers: [AvailabilityController, MeCalendarController],
  providers: [AvailabilityService],
  exports: [AvailabilityService], // consommé par PartiesModule et PollModule
})
export class AvailabilityModule {}
