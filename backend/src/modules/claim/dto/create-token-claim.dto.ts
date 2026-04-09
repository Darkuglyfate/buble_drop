import { IsUUID, IsString } from 'class-validator';

export class CreateTokenClaimDto {
  @IsUUID()
  profileId: string;

  @IsString()
  tokenSymbol: string;

  @IsString()
  amount: string;
}
