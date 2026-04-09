import { IsString } from 'class-validator';

export class VerifyAuthSessionDto {
  @IsString()
  message: string;

  @IsString()
  signature: string;
}
