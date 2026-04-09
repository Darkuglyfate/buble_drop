import { IsString, IsInt } from 'class-validator';

export class RequestAuthSessionNonceDto {
  @IsString()
  walletAddress: string;

  @IsInt()
  chainId: number;
}
