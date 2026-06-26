import { Module } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';

@Module({
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService], // réutilisé par InvitationsModule (vérifs MJ / appartenance)
})
export class PartiesModule {}
