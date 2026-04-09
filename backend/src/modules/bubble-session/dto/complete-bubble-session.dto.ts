import { IsUUID, IsInt, Min, Max } from 'class-validator';

export class CompleteBubbleSessionDto {
  @IsUUID()
  profileId: string;

  @IsUUID()
  sessionId: string;

  @IsInt()
  @Min(0)
  @Max(3600)
  activeSeconds: number;

  @IsInt()
  @Min(0)
  finalScore: number;

  @IsInt()
  @Min(0)
  bestCombo: number;
}
