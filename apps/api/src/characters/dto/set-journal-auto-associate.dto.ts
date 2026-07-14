import { IsBoolean } from 'class-validator';

export class SetJournalAutoAssociateDto {
  @IsBoolean()
  journalAutoAssociate!: boolean;
}
