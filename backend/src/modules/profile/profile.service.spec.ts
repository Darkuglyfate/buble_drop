import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import { XpService } from '../rewards/xp.service';
import { Avatar } from './entities/avatar.entity';
import { CosmeticDefinition } from './entities/cosmetic-definition.entity';
import { NftDefinition } from './entities/nft-definition.entity';
import { Profile } from './entities/profile.entity';
import { ProfileAvatarUnlock } from './entities/profile-avatar-unlock.entity';
import { ProfileCosmeticUnlock } from './entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from './entities/profile-nft-ownership.entity';
import { RankFrameDefinition } from './entities/rank-frame-definition.entity';
import { UserWallet } from './entities/user-wallet.entity';
import { ProfileService } from './profile.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('ProfileService', () => {
  let service: ProfileService;
  let walletRepository: MockRepository<UserWallet>;
  let profileRepository: MockRepository<Profile>;
  let avatarRepository: MockRepository<Avatar>;
  let profileAvatarUnlockRepository: MockRepository<ProfileAvatarUnlock>;
  let rankFrameDefinitionRepository: MockRepository<RankFrameDefinition>;
  let profileNftOwnershipRepository: MockRepository<ProfileNftOwnership>;
  let nftDefinitionRepository: MockRepository<NftDefinition>;
  let profileCosmeticUnlockRepository: MockRepository<ProfileCosmeticUnlock>;
  let cosmeticDefinitionRepository: MockRepository<CosmeticDefinition>;
  let claimableTokenBalanceRepository: MockRepository<ClaimableTokenBalance>;
  let qualificationService: { evaluateProgress: jest.Mock };
  let xpService: { grantXp: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    walletRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    profileRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    avatarRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    profileAvatarUnlockRepository = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    rankFrameDefinitionRepository = {
      find: jest.fn(),
    };
    profileNftOwnershipRepository = {
      find: jest.fn(),
    };
    nftDefinitionRepository = {
      find: jest.fn(),
    };
    profileCosmeticUnlockRepository = {
      find: jest.fn(),
    };
    cosmeticDefinitionRepository = {
      find: jest.fn(),
    };
    claimableTokenBalanceRepository = {
      find: jest.fn(),
    };
    qualificationService = {
      evaluateProgress: jest.fn(),
    };
    xpService = {
      grantXp: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: getRepositoryToken(UserWallet),
          useValue: walletRepository,
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: profileRepository,
        },
        {
          provide: getRepositoryToken(Avatar),
          useValue: avatarRepository,
        },
        {
          provide: getRepositoryToken(ProfileAvatarUnlock),
          useValue: profileAvatarUnlockRepository,
        },
        {
          provide: getRepositoryToken(RankFrameDefinition),
          useValue: rankFrameDefinitionRepository,
        },
        {
          provide: getRepositoryToken(ClaimableTokenBalance),
          useValue: claimableTokenBalanceRepository,
        },
        {
          provide: getRepositoryToken(ProfileNftOwnership),
          useValue: profileNftOwnershipRepository,
        },
        {
          provide: getRepositoryToken(NftDefinition),
          useValue: nftDefinitionRepository,
        },
        {
          provide: getRepositoryToken(ProfileCosmeticUnlock),
          useValue: profileCosmeticUnlockRepository,
        },
        {
          provide: getRepositoryToken(CosmeticDefinition),
          useValue: cosmeticDefinitionRepository,
        },
        {
          provide: QualificationService,
          useValue: qualificationService,
        },
        {
          provide: XpService,
          useValue: xpService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  it('creates wallet and profile for a new wallet', async () => {
    walletRepository.findOne!.mockResolvedValue(null);
    walletRepository.create!.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111',
    });
    walletRepository.save!.mockResolvedValue({
      id: 'wallet-1',
      address: '0x1111111111111111111111111111111111111111',
    });

    profileRepository.findOne!.mockResolvedValue(null);
    profileRepository.create!.mockReturnValue({
      walletId: 'wallet-1',
      nickname: null,
      currentAvatarId: null,
      totalXp: 0,
      currentStreak: 0,
      onboardingCompletedAt: null,
    });
    profileRepository.save!.mockResolvedValue({
      id: 'profile-1',
      walletId: 'wallet-1',
      nickname: null,
      currentAvatarId: null,
      totalXp: 0,
      currentStreak: 0,
      onboardingCompletedAt: null,
    });

    const result = await service.connectWallet(
      '0x1111111111111111111111111111111111111111',
    );

    expect(result).toEqual({
      walletId: 'wallet-1',
      walletAddress: '0x1111111111111111111111111111111111111111',
      profileId: 'profile-1',
      nickname: null,
      currentAvatarId: null,
      totalXp: 0,
      currentStreak: 0,
      needsOnboarding: true,
    });
  });

  it('returns existing profile for an existing wallet', async () => {
    walletRepository.findOne!.mockResolvedValue({
      id: 'wallet-2',
      address: '0x2222222222222222222222222222222222222222',
    });
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-2',
      walletId: 'wallet-2',
      nickname: 'bubbler',
      currentAvatarId: 'avatar-1',
      totalXp: 120,
      currentStreak: 4,
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });

    const result = await service.connectWallet(
      '0x2222222222222222222222222222222222222222',
    );

    expect(result).toEqual({
      walletId: 'wallet-2',
      walletAddress: '0x2222222222222222222222222222222222222222',
      profileId: 'profile-2',
      nickname: 'bubbler',
      currentAvatarId: 'avatar-1',
      totalXp: 120,
      currentStreak: 4,
      needsOnboarding: false,
    });
  });

  it('throws for invalid wallet address', async () => {
    await expect(
      service.connectWallet('invalid-address'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns mvp profile summary', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      walletId: 'wallet-1',
      nickname: 'bubbler',
      currentAvatarId: 'avatar-1',
      totalXp: 710,
      currentStreak: 6,
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    walletRepository.findOne!.mockResolvedValue({
      id: 'wallet-1',
      address: '0x1111111111111111111111111111111111111111',
    });
    avatarRepository.findOne!.mockResolvedValue({
      id: 'avatar-1',
      key: 'starter-blue',
      label: 'Starter Blue',
    });
    profileAvatarUnlockRepository.count!.mockResolvedValue(4);
    rankFrameDefinitionRepository.find!.mockResolvedValue([
      { id: 'rf1', key: 'bronze', label: 'Bronze', minLifetimeXp: 0 },
      { id: 'rf2', key: 'silver', label: 'Silver', minLifetimeXp: 250 },
      { id: 'rf3', key: 'gold', label: 'Gold', minLifetimeXp: 700 },
      { id: 'rf4', key: 'platinum', label: 'Platinum', minLifetimeXp: 1500 },
    ]);
    qualificationService.evaluateProgress.mockResolvedValue({
      qualificationStatus: QualificationStatus.QUALIFIED,
      rareRewardAccessActive: true,
    });
    claimableTokenBalanceRepository.find!.mockResolvedValue([
      { tokenSymbol: 'AAA', claimableAmount: '0' },
      { tokenSymbol: 'BBB', claimableAmount: '100' },
      { tokenSymbol: 'CCC', claimableAmount: '25' },
    ]);

    const result = await service.getProfileSummary(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.onboardingState.needsOnboarding).toBe(false);
    expect(result.profileIdentity.nickname).toBe('bubbler');
    expect(result.rankFrameState.currentFrame?.key).toBe('gold');
    expect(result.rankFrameState.nextFrame?.key).toBe('platinum');
    expect(result.qualificationState.status).toBe(
      QualificationStatus.QUALIFIED,
    );
    expect(result.rareRewardAccess.active).toBe(true);
    expect(result.claimableTokenBalanceSummary.totalClaimableAmount).toBe(
      '125',
    );
    expect(result.claimableTokenBalanceSummary.tokenCount).toBe(2);
  });

  it('completes onboarding with starter avatar and grants onboarding xp', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-3',
      nickname: null,
      currentAvatarId: null,
      totalXp: 0,
      onboardingCompletedAt: null,
    });
    avatarRepository.findOne!.mockResolvedValue({
      id: 'avatar-starter',
      isStarter: true,
    });
    profileAvatarUnlockRepository.findOne!.mockResolvedValue(null);
    profileAvatarUnlockRepository.create!.mockImplementation(
      (value: { profileId: string; avatarId: string }) => value,
    );
    profileAvatarUnlockRepository.save!.mockImplementation(
      (value: { profileId: string; avatarId: string }) =>
        Promise.resolve(value),
    );
    configService.get.mockReturnValue(20);
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 20,
      remainingDailyCap: 80,
      grantedAllocations: [],
    });
    profileRepository.save!.mockImplementation((profile: Profile) =>
      Promise.resolve(profile),
    );

    const result = await service.completeOnboarding(
      '11111111-1111-4111-8111-111111111111',
      'newbie',
      '22222222-2222-4222-8222-222222222222',
    );

    expect(result.nickname).toBe('newbie');
    expect(result.onboardingXpGranted).toBe(20);
    expect(result.totalXp).toBe(20);
    expect(result.needsOnboarding).toBe(false);
    expect(xpService.grantXp).toHaveBeenCalled();
  });

  it('rejects repeated onboarding completion after first success', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-3',
      nickname: 'existing-name',
      currentAvatarId: 'existing-avatar',
      totalXp: 20,
      onboardingCompletedAt: new Date('2026-03-14T12:00:00.000Z'),
    });

    await expect(
      service.completeOnboarding(
        '11111111-1111-4111-8111-111111111111',
        'new-name',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(avatarRepository.findOne).not.toHaveBeenCalled();
    expect(profileAvatarUnlockRepository.save).not.toHaveBeenCalled();
    expect(profileRepository.save).not.toHaveBeenCalled();
    expect(xpService.grantXp).not.toHaveBeenCalled();
  });

  it('returns starter avatars for onboarding selection', async () => {
    avatarRepository.find!.mockResolvedValue([
      {
        id: 'avatar-1',
        key: 'starter-bubble-blue',
        label: 'Starter Bubble Blue',
      },
      {
        id: 'avatar-2',
        key: 'starter-bubble-lilac',
        label: 'Starter Bubble Lilac',
      },
    ]);

    const result = await service.getStarterAvatars();

    expect(result).toEqual([
      {
        id: 'avatar-1',
        key: 'starter-bubble-blue',
        label: 'Starter Bubble Blue',
      },
      {
        id: 'avatar-2',
        key: 'starter-bubble-lilac',
        label: 'Starter Bubble Lilac',
      },
    ]);
  });

  it('rejects rewards inventory when onboarding is incomplete', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-4',
      nickname: null,
      currentAvatarId: null,
      onboardingCompletedAt: null,
    });

    await expect(
      service.getRewardsInventory('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(profileNftOwnershipRepository.find).not.toHaveBeenCalled();
    expect(profileCosmeticUnlockRepository.find).not.toHaveBeenCalled();
  });
});
