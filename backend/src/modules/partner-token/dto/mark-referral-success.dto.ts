import { IsUUID } from 'class-validator';

export class MarkReferralSuccessDto {
  @IsUUID()
  referralId: string;
}
