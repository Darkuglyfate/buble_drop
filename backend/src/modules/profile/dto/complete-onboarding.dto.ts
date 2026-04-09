import { IsUUID, IsString, MaxLength, IsOptional } from 'class-validator';

export class CompleteOnboardingDto {
  @IsUUID()
  profileId: string;

  @IsString()
  @MaxLength(32)
  nickname: string;

  @IsUUID()
  @IsOptional()
  avatarId?: string;
}
