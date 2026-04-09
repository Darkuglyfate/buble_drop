import { IsString, IsOptional } from 'class-validator';

export class ConnectWalletDto {
  @IsString()
  @IsOptional()
  walletAddress: string;
}
