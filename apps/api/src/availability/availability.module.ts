import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';
import { MeCalendarController } from './me-calendar.controller';

@Module({
  controllers: [AvailabilityController, MeCalendarController],
  providers: [AvailabilityService],
  exports: [AvailabilityService], // consommé par PartiesModule et PollModule
})
export class AvailabilityModule {}
