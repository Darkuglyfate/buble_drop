import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from '../partner-token/entities/referral.entity';
import { Profile } from '../profile/entities/profile.entity';
import {
  WALLET_ADDRESS_HEADER,
  WalletBindingService,
} from './wallet-binding.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('WalletBindingService', () => {
  let service: WalletBindingService;
  let profileRepository: MockRepository<Profile>;
  let referralRepository: MockRepository<Referral>;

  beforeEach(async () => {
    profileRepository = {
      findOne: jest.fn(),
    };
    referralRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletBindingService,
        {
          provide: getRepositoryToken(Profile),
          useValue: profileRepository,
        },
        {
          provide: getRepositoryToken(Referral),
          useValue: referralRepository,
        },
      ],
    }).compile();

    service = module.get<WalletBindingService>(WalletBindingService);
  });

  it('allows profile mutation when wallet matches profile owner', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    await expect(
      service.assertProfileAccess(
        '11111111-1111-4111-8111-111111111111',
        '0x1111111111111111111111111111111111111111',
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects profile mutation when wallet header is missing', async () => {
    await expect(
      service.assertProfileAccess(
        '11111111-1111-4111-8111-111111111111',
        undefined,
      ),
    ).rejects.toEqual(
      new BadRequestException(`Missing ${WALLET_ADDRESS_HEADER} header`),
    );
  });

  it('rejects profile mutation when wallet does not own profile', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    await expect(
      service.assertProfileAccess(
        '11111111-1111-4111-8111-111111111111',
        '0x2222222222222222222222222222222222222222',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows referral mutation when wallet matches inviter profile owner', async () => {
    referralRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      inviterProfile: {
        id: '11111111-1111-4111-8111-111111111111',
        wallet: {
          address: '0x1111111111111111111111111111111111111111',
        },
      },
    });

    await expect(
      service.assertReferralAccess(
        '33333333-3333-4333-8333-333333333333',
        '0x1111111111111111111111111111111111111111',
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects referral mutation when inviter wallet binding mismatches', async () => {
    referralRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      inviterProfile: {
        id: '11111111-1111-4111-8111-111111111111',
        wallet: {
          address: '0x1111111111111111111111111111111111111111',
        },
      },
    });

    await expect(
      service.assertReferralAccess(
        '33333333-3333-4333-8333-333333333333',
        '0x2222222222222222222222222222222222222222',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when referral is missing', async () => {
    referralRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.assertReferralAccess(
        '33333333-3333-4333-8333-333333333333',
        '0x1111111111111111111111111111111111111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
