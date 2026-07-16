import { UnauthorizedException } from '@nestjs/common';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';
import { PartnerTokenController } from './partner-token.controller';
import { PartnerTokenService } from './partner-token.service';

describe('PartnerTokenController owner reads', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  let controller: PartnerTokenController;
  let partnerTokenService: { getReferralProgress: jest.Mock };
  let walletBindingService: {
    resolveAuthenticatedProfileId: jest.Mock;
  };

  beforeEach(() => {
    partnerTokenService = {
      getReferralProgress: jest.fn().mockResolvedValue({}),
    };
    walletBindingService = {
      resolveAuthenticatedProfileId: jest.fn().mockResolvedValue(profileId),
    };
    controller = new PartnerTokenController(
      partnerTokenService as unknown as PartnerTokenService,
      walletBindingService as unknown as WalletBindingService,
    );
  });

  const callReferralProgress = (authSessionHeader?: string) =>
    (
      controller.getReferralProgress as unknown as (
        header?: string,
      ) => Promise<unknown>
    )(authSessionHeader);

  it.each([undefined, 'invalid-session'])(
    'rejects referral progress for session %p',
    async (authSessionHeader) => {
      walletBindingService.resolveAuthenticatedProfileId.mockRejectedValueOnce(
        new UnauthorizedException('Invalid auth session'),
      );

      await expect(
        callReferralProgress(authSessionHeader),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('derives referral progress from the authenticated session', async () => {
    await callReferralProgress('valid-session');

    expect(
      walletBindingService.resolveAuthenticatedProfileId,
    ).toHaveBeenCalledWith('valid-session');
    expect(partnerTokenService.getReferralProgress).toHaveBeenCalledWith(
      profileId,
    );
    expect(controller.getReferralProgress.length).toBe(1);
  });
});
