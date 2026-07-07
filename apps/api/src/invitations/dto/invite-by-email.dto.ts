import { IsEmail, MaxLength } from 'class-validator';

export class InviteByEmailDto {
  @IsEmail()
  @MaxLength(254) // RFC 5321
  email!: string;
}
