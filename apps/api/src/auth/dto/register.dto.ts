import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  pseudo!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** Token d'un lien d'invitation : l'inscription est ouverte **uniquement** sur invitation (spec §2). */
  @IsString()
  @MinLength(1)
  token!: string;
}
