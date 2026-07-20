import { Global, Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeController } from './realtime.controller';

@Global()
@Module({
  imports: [PartiesModule],
  controllers: [RealtimeController],
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
