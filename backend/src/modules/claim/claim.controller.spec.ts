import { UnauthorizedException } from '@nestjs/common';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';
import { ClaimController } from './claim.controller';
import { ClaimService } from './claim.service';

describe('ClaimController owner reads', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  let controller: ClaimController;
  let claimService: { getClaimableBalances: jest.Mock };
  let walletBindingService: {
    resolveAuthenticatedProfileId: jest.Mock;
  };

  beforeEach(() => {
    claimService = {
      getClaimableBalances: jest.fn().mockResolvedValue([]),
    };
    walletBindingService = {
      resolveAuthenticatedProfileId: jest.fn().mockResolvedValue(profileId),
    };
    controller = new ClaimController(
      claimService as unknown as ClaimService,
      walletBindingService as unknown as WalletBindingService,
    );
  });

  const callBalances = (authSessionHeader?: string) =>
    (
      controller.getClaimableBalances as unknown as (
        header?: string,
      ) => Promise<unknown>
    )(authSessionHeader);

  it.each([undefined, 'invalid-session'])(
    'rejects owner balances for session %p',
    async (authSessionHeader) => {
      walletBindingService.resolveAuthenticatedProfileId.mockRejectedValueOnce(
        new UnauthorizedException('Invalid auth session'),
      );

      await expect(callBalances(authSessionHeader)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('derives the balances profile from the authenticated session', async () => {
    await callBalances('valid-session');

    expect(
      walletBindingService.resolveAuthenticatedProfileId,
    ).toHaveBeenCalledWith('valid-session');
    expect(claimService.getClaimableBalances).toHaveBeenCalledWith(profileId);
    expect(controller.getClaimableBalances.length).toBe(1);
  });
});
