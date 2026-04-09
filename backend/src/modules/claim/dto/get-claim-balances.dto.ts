import { IsUUID } from 'class-validator';

export class GetClaimBalancesDto {
  @IsUUID()
  profileId: string;
}
