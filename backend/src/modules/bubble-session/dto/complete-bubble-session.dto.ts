import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const POSTGRES_INT_MAX = 2_147_483_647;

export class CompleteBubbleSessionDto {
  @IsUUID()
  profileId: string;

  @IsUUID()
  sessionId: string;

  @IsInt()
  @Min(0)
  @Max(3600)
  activeSeconds: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INT_MAX)
  finalScore = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INT_MAX)
  bestCombo = 0;
}
