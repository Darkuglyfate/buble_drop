import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
import { Profile } from '../profile/entities/profile.entity';
import { XpService } from '../rewards/xp.service';
import { PartnerToken } from './entities/partner-token.entity';
import { PartnerTokenPin } from './entities/partner-token-pin.entity';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { Season } from './entities/season.entity';
import { PartnerTokenService } from './partner-token.service';
import { SeasonService } from './season.service';

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
  let dataSource: { transaction: jest.Mock };
  let transactionManager: { getRepository: jest.Mock };

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
    transactionManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Referral) {
          return referralRepository;
        }
        if (entity === Profile) {
          return profileRepository;
        }
        if (entity === CheckInRecord) {
          return checkInRepository;
        }
        if (entity === Season) {
          return seasonRepository;
        }
        throw new Error('Unexpected repository');
      }),
    };
    dataSource = {
      transaction: jest.fn(
        async (work: (manager: EntityManager) => Promise<unknown>) =>
          work(transactionManager as EntityManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerTokenService,
        SeasonService,
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
        { provide: DataSource, useValue: dataSource },
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

  it('excludes an active future season from the season hub', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    seasonRepository.findOne!.mockImplementation(async (options) => {
      const where = options?.where as Record<string, unknown>;
      return where.startDate && where.endDate
        ? null
        : ({
            id: 'future-season',
            key: 'future',
            title: 'Future season',
            startDate: '2026-03-16',
            endDate: '2026-03-31',
            isActive: true,
          } as Season);
    });
    partnerTokenRepository.find!.mockResolvedValue([]);

    await expect(service.getSeasonHub()).resolves.toEqual({
      season: null,
      tokenCount: 0,
      tokens: [],
    });

    jest.useRealTimers();
  });

  it('keeps expired-season token details readable', async () => {
    partnerTokenRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      symbol: 'OLD',
      name: 'Old token',
      contractAddress: '0x1111111111111111111111111111111111111111',
      twitterUrl: 'https://x.com/old',
      chartUrl: null,
      dexscreenerUrl: null,
      season: {
        id: 'expired-season',
        key: 'expired',
        title: 'Expired season',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        isActive: true,
      },
    });
    partnerTokenPinRepository.count!.mockResolvedValue(2);

    const result = await service.getTokenDetail(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.season.key).toBe('expired');
    expect(result.pinCount).toBe(2);
  });

  it('marks referral as successful and grants referral xp once', async () => {
    seasonRepository.findOne!.mockResolvedValue({ id: 'season-1' });
    referralRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      inviterProfileId: '11111111-1111-4111-8111-111111111111',
      invitedProfileId: '22222222-2222-4222-8222-222222222222',
      status: ReferralStatus.PENDING,
      successfulAt: null,
    });
    profileRepository
      .findOne!.mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        totalXp: 100,
      })
      .mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        nickname: 'invited-user',
        onboardingCompletedAt: new Date('2026-03-14T10:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        totalXp: 150,
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
    expect(xpService.grantXp).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      [expect.objectContaining({ seasonId: 'season-1' })],
      undefined,
      transactionManager,
    );
    expect(transactionManager.getRepository).toHaveBeenCalledWith(Season);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not grant referral xp again if referral already successful', async () => {
    referralRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      inviterProfileId: '11111111-1111-4111-8111-111111111111',
      invitedProfileId: '22222222-2222-4222-8222-222222222222',
      status: ReferralStatus.SUCCESSFUL,
      successfulAt: new Date('2026-03-14T10:00:00.000Z'),
    });
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      totalXp: 250,
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
