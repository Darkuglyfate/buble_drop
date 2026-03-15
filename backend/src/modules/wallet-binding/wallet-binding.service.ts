import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthSessionService } from '../auth-session/auth-session.service';
import { Referral } from '../partner-token/entities/referral.entity';
import { Profile } from '../profile/entities/profile.entity';

@Injectable()
export class WalletBindingService {
  constructor(
    private readonly authSessionService: AuthSessionService,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
  ) {}

  async assertProfileAccess(
    profileId: string,
    authSessionHeader: string | undefined,
  ): Promise<void> {
    this.assertUuid(profileId, 'Invalid profileId format');
    const normalizedWalletAddress =
      this.authSessionService.getAuthenticatedWalletAddress(authSessionHeader);

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
    authSessionHeader: string | undefined,
  ): Promise<void> {
    this.assertUuid(referralId, 'Invalid referralId format');
    const normalizedWalletAddress =
      this.authSessionService.getAuthenticatedWalletAddress(authSessionHeader);

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
