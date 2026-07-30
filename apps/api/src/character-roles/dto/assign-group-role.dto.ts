import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AssignGroupRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roleKey!: string;
}
