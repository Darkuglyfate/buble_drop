import { IsUUID, IsString, IsOptional } from 'class-validator';

export class DailyCheckInDto {
  @IsUUID()
  profileId: string;

  @IsString()
  @IsOptional()
  txHash?: string;
}
