import { IsString, Length } from 'class-validator';

export class AuthRaterDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  @Length(1, 120)
  accessCode!: string;
}

export class AdminLoginDto {
  @IsString()
  @Length(1, 120)
  password!: string;
}
