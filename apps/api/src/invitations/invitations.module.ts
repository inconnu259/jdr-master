import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { InviteLinksService } from './invite-links.service';
import { InviteLinksController } from './invite-links.controller';

// PrismaService est global ; on réutilise PartiesService (vérifs MJ/appartenance).
@Module({
  imports: [PartiesModule],
  controllers: [InvitationsController, InviteLinksController],
  providers: [InvitationsService, InviteLinksService],
  exports: [InviteLinksService], // consommé par AuthService (inscription sur invitation)
})
export class InvitationsModule {}
