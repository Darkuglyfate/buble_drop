import { IsUUID } from 'class-validator';

export class GetProfileSummaryDto {
  @IsUUID()
  profileId: string;
}
