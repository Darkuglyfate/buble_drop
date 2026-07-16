import { UnauthorizedException } from '@nestjs/common';
import { AuthSessionService } from '../auth-session/auth-session.service';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

describe('ProfileController owner reads', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  let controller: ProfileController;
  let profileService: {
    getProfileSummary: jest.Mock;
    getRewardsInventory: jest.Mock;
  };
  let walletBindingService: {
    resolveAuthenticatedProfileId: jest.Mock;
  };

  beforeEach(() => {
    profileService = {
      getProfileSummary: jest.fn().mockResolvedValue({ profileId }),
      getRewardsInventory: jest.fn().mockResolvedValue({ profileId }),
    };
    walletBindingService = {
      resolveAuthenticatedProfileId: jest.fn().mockResolvedValue(profileId),
    };
    controller = new ProfileController(
      profileService as unknown as ProfileService,
      {} as AuthSessionService,
      walletBindingService as unknown as WalletBindingService,
    );
  });

  const callSummary = (authSessionHeader?: string) =>
    (
      controller.getProfileSummary as unknown as (
        header?: string,
      ) => Promise<unknown>
    )(authSessionHeader);

  const callInventory = (authSessionHeader?: string) =>
    (
      controller.getRewardsInventory as unknown as (
        header?: string,
      ) => Promise<unknown>
    )(authSessionHeader);

  it.each([
    ['summary', callSummary],
    ['rewards inventory', callInventory],
  ])('rejects missing session for %s', async (_name, callOwnerRead) => {
    walletBindingService.resolveAuthenticatedProfileId.mockRejectedValueOnce(
      new UnauthorizedException('Missing auth session'),
    );

    await expect(callOwnerRead()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['summary', callSummary],
    ['rewards inventory', callInventory],
  ])('rejects invalid session for %s', async (_name, callOwnerRead) => {
    walletBindingService.resolveAuthenticatedProfileId.mockRejectedValueOnce(
      new UnauthorizedException('Invalid auth session'),
    );

    await expect(callOwnerRead('invalid-session')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('derives the summary profile from the authenticated session', async () => {
    await callSummary('valid-session');

    expect(
      walletBindingService.resolveAuthenticatedProfileId,
    ).toHaveBeenCalledWith('valid-session');
    expect(profileService.getProfileSummary).toHaveBeenCalledWith(profileId);
    expect(controller.getProfileSummary.length).toBe(1);
  });

  it('derives the inventory profile from the authenticated session', async () => {
    await callInventory('valid-session');

    expect(
      walletBindingService.resolveAuthenticatedProfileId,
    ).toHaveBeenCalledWith('valid-session');
    expect(profileService.getRewardsInventory).toHaveBeenCalledWith(profileId);
    expect(controller.getRewardsInventory.length).toBe(1);
  });
});
