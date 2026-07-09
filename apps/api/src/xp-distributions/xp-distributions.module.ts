import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { CharacterModule } from '../characters/character.module';
import { XpDistributionsController } from './xp-distributions.controller';
import { XpDistributionsService } from './xp-distributions.service';

@Module({
  imports: [PartiesModule, CharacterModule],
  controllers: [XpDistributionsController],
  providers: [XpDistributionsService],
})
export class XpDistributionsModule {}
