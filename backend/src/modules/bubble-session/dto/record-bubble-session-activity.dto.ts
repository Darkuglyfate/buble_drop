import { IsUUID } from 'class-validator';

export class RecordBubbleSessionActivityDto {
  @IsUUID()
  profileId: string;

  @IsUUID()
  sessionId: string;
}
