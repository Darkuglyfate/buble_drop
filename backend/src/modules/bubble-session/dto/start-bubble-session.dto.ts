import { IsUUID } from 'class-validator';

export class StartBubbleSessionDto {
  @IsUUID()
  profileId: string;
}
