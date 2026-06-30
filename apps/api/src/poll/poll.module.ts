import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PartiesModule } from '../parties/parties.module';
import { PollController } from './poll.controller';
import { PollService } from './poll.service';

@Module({
  imports: [PartiesModule, AvailabilityModule],
  controllers: [PollController],
  providers: [PollService],
})
export class PollModule {}
