import { IsUUID } from 'class-validator';

export class CreateInvitationDto {
  @IsUUID()
  inviteeUserId!: string;
}
