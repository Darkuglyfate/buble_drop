import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
import { Profile } from '../profile/entities/profile.entity';
import { XpService } from '../rewards/xp.service';
import { PartnerToken } from './entities/partner-token.entity';
import { PartnerTokenPin } from './entities/partner-token-pin.entity';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { Season } from './entities/season.entity';
import { PartnerTokenService } from './partner-token.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('PartnerTokenService', () => {
  let service: PartnerTokenService;
  let seasonRepository: MockRepository<Season>;
  let partnerTokenRepository: MockRepository<PartnerToken>;
  let partnerTokenPinRepository: MockRepository<PartnerTokenPin>;
  let referralRepository: MockRepository<Referral>;
  let profileRepository: MockRepository<Profile>;
  let checkInRepository: MockRepository<CheckInRecord>;
  let xpService: { grantXp: jest.Mock };

  beforeEach(async () => {
    seasonRepository = {
      findOne: jest.fn(),
    };
    partnerTokenRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    partnerTokenPinRepository = {
      count: jest.fn(),
    };
    referralRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    profileRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    checkInRepository = {
      findOne: jest.fn(),
    };
    xpService = {
      grantXp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerTokenService,
        {
          provide: getRepositoryToken(Season),
          useValue: seasonRepository,
        },
        {
          provide: getRepositoryToken(PartnerToken),
          useValue: partnerTokenRepository,
        },
        {
          provide: getRepositoryToken(PartnerTokenPin),
          useValue: partnerTokenPinRepository,
        },
        {
          provide: getRepositoryToken(Referral),
          useValue: referralRepository,
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: profileRepository,
        },
        {
          provide: getRepositoryToken(CheckInRecord),
          useValue: checkInRepository,
        },
        {
          provide: XpService,
          useValue: xpService,
        },
      ],
    }).compile();

    service = module.get<PartnerTokenService>(PartnerTokenService);
  });

  it('returns mvp transparency list fields', async () => {
    partnerTokenRepository.find!.mockResolvedValue([
      {
        id: 'token-1',
        name: 'BUB',
        contractAddress: '0x1111111111111111111111111111111111111111',
        twitterUrl: 'https://x.com/bub',
        chartUrl: 'https://chart.example/bub',
        dexscreenerUrl: 'https://dexscreener.com/base/bub',
        season: {
          title: 'Season 1',
        },
      },
    ]);

    const result = await service.getTransparencyList();

    expect(result).toEqual([
      {
        id: 'token-1',
        name: 'BUB',
        contractAddress: '0x1111111111111111111111111111111111111111',
        twitterUrl: 'https://x.com/bub',
        chartUrl: 'https://chart.example/bub',
        dexscreenerUrl: 'https://dexscreener.com/base/bub',
        seasonTitle: 'Season 1',
      },
    ]);
  });

  it('marks referral as successful and grants referral xp once', async () => {
    referralRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      inviterProfileId: '11111111-1111-4111-8111-111111111111',
      invitedProfileId: '22222222-2222-4222-8222-222222222222',
      status: ReferralStatus.PENDING,
      successfulAt: null,
    });
    profileRepository
      .findOne!.mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        nickname: 'invited-user',
        onboardingCompletedAt: new Date('2026-03-14T10:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        totalXp: 100,
      });
    checkInRepository.findOne!.mockResolvedValue({
      id: 'check-in-1',
      checkInDate: '2026-03-14',
    });
    referralRepository.save!.mockImplementation(
      (referral: unknown): Promise<unknown> => Promise.resolve(referral),
    );
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 50,
      remainingDailyCap: 50,
      grantedAllocations: [],
    });
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );

    const result = await service.markReferralSuccessful(
      '33333333-3333-4333-8333-333333333333',
    );

    expect(result.status).toBe(ReferralStatus.SUCCESSFUL);
    expect(result.referralXpGranted).toBe(50);
    expect(result.inviterTotalXp).toBe(150);
    expect(xpService.grantXp).toHaveBeenCalled();
  });

  it('does not grant referral xp again if referral already successful', async () => {
    referralRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      inviterProfileId: '11111111-1111-4111-8111-111111111111',
      invitedProfileId: '22222222-2222-4222-8222-222222222222',
      status: ReferralStatus.SUCCESSFUL,
      successfulAt: new Date('2026-03-14T10:00:00.000Z'),
    });
    profileRepository
      .findOne!.mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        nickname: 'invited-user',
        onboardingCompletedAt: new Date('2026-03-14T10:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        totalXp: 250,
      });
    checkInRepository.findOne!.mockResolvedValue({
      id: 'check-in-1',
      checkInDate: '2026-03-14',
    });

    const result = await service.markReferralSuccessful(
      '33333333-3333-4333-8333-333333333333',
    );

    expect(result.referralXpGranted).toBe(0);
    expect(result.inviterTotalXp).toBe(250);
    expect(xpService.grantXp).not.toHaveBeenCalled();
  });

  it('rejects referral progress when onboarding is incomplete', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: null,
      currentAvatarId: null,
      onboardingCompletedAt: null,
    });

    await expect(
      service.getReferralProgress('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(referralRepository.find).not.toHaveBeenCalled();
  });
});
