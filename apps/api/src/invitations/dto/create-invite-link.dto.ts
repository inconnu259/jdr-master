import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class CreateInviteLinkDto {
  /** null/absent = usage illimité · 1 = usage unique · N = X joueurs. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  /** ISO 8601 ; défaut +7 jours si absent. */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
