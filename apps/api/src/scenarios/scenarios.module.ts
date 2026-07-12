import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  imports: [PartiesModule],
  controllers: [ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
