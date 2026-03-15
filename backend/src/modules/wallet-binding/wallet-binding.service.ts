import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from '../partner-token/entities/referral.entity';
import { Profile } from '../profile/entities/profile.entity';

export const WALLET_ADDRESS_HEADER = 'x-bubbledrop-wallet-address';

@Injectable()
export class WalletBindingService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
  ) {}

  async assertProfileAccess(
    profileId: string,
    walletAddressHeader: string | undefined,
  ): Promise<void> {
    this.assertUuid(profileId, 'Invalid profileId format');
    const normalizedWalletAddress =
      this.normalizeWalletAddressHeader(walletAddressHeader);

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: {
        wallet: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (!profile.wallet) {
      throw new NotFoundException('Wallet not found for profile');
    }

    if (profile.wallet.address !== normalizedWalletAddress) {
      throw new ForbiddenException(
        'Wallet address does not match requested profile mutation',
      );
    }
  }

  async assertReferralAccess(
    referralId: string,
    walletAddressHeader: string | undefined,
  ): Promise<void> {
    this.assertUuid(referralId, 'Invalid referralId format');
    const normalizedWalletAddress =
      this.normalizeWalletAddressHeader(walletAddressHeader);

    const referral = await this.referralRepository.findOne({
      where: { id: referralId },
      relations: {
        inviterProfile: {
          wallet: true,
        },
      },
    });
    if (!referral) {
      throw new NotFoundException('Referral not found');
    }

    if (!referral.inviterProfile?.wallet) {
      throw new NotFoundException('Inviter wallet not found for referral');
    }

    if (referral.inviterProfile.wallet.address !== normalizedWalletAddress) {
      throw new ForbiddenException(
        'Wallet address does not match requested referral mutation',
      );
    }
  }

  private normalizeWalletAddressHeader(
    walletAddressHeader: string | undefined,
  ): string {
    const normalized = walletAddressHeader?.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException(`Missing ${WALLET_ADDRESS_HEADER} header`);
    }

    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      throw new BadRequestException('Invalid wallet address format');
    }

    return normalized;
  }

  private assertUuid(value: string, message: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException(message);
    }
  }
}
