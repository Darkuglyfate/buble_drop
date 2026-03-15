import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import { XpService, XpSource } from '../rewards/xp.service';
import { CheckInOnchainService } from './check-in-onchain.service';
import { CheckInRecord } from './entities/check-in-record.entity';

export interface DailyCheckInResult {
  success: true;
  profileId: string;
  checkInDate: string;
  xpAwarded: number;
  newStreak: number;
  totalXp: number;
  rareAccessActive: boolean;
  currentStreak: number;
  qualificationStatus: QualificationStatus;
  rareRewardAccessActive: boolean;
}

@Injectable()
export class CheckInService {
  constructor(
    @InjectRepository(CheckInRecord)
    private readonly checkInRecordRepository: Repository<CheckInRecord>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly qualificationService: QualificationService,
    private readonly xpService: XpService,
    private readonly checkInOnchainService: CheckInOnchainService,
  ) {}

  async performDailyCheckIn(
    profileId: string,
    txHash?: string,
  ): Promise<DailyCheckInResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    this.assertTxHash(txHash);

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: {
        wallet: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const today = this.getUtcDateKey(new Date());
    const existingToday = await this.checkInRecordRepository.findOne({
      where: { profileId, checkInDate: today },
    });
    if (existingToday) {
      throw new ConflictException('Daily check-in already completed for today');
    }

    const lastRecord = await this.checkInRecordRepository.findOne({
      where: { profileId },
      order: { checkInDate: 'DESC' },
    });

    const missedDay = this.hasMissedDay(lastRecord?.checkInDate ?? null, today);
    profile.currentStreak = this.calculateNextStreak(
      profile.currentStreak,
      lastRecord?.checkInDate ?? null,
      today,
    );

    const onchainResult =
      profile.wallet?.address && profile.wallet.address.trim().length > 0
        ? await this.checkInOnchainService.recordDailyCheckIn({
            walletAddress: profile.wallet.address,
            checkInDate: today,
          })
        : { txHash: null, submitted: false };
    await this.profileRepository.save(profile);

    const record = this.checkInRecordRepository.create({
      profileId,
      checkInDate: today,
      txHash: onchainResult.txHash ?? txHash ?? null,
    });
    await this.checkInRecordRepository.save(record);

    const xpGrant = await this.xpService.grantXp(profileId, [
      {
        source: XpSource.DAILY_CHECK_IN,
        amount: 20,
        metadata: {
          checkInDate: today,
          txHash: txHash ?? null,
        },
      },
    ]);
    const xpAwarded = xpGrant.grantedTotal;
    if (xpAwarded > 0) {
      profile.totalXp += xpAwarded;
      await this.profileRepository.save(profile);
    }

    const qualification =
      await this.qualificationService.processAfterDailyCheckIn(
        profileId,
        missedDay,
      );

    return {
      success: true,
      profileId: profile.id,
      checkInDate: today,
      xpAwarded,
      newStreak: profile.currentStreak,
      totalXp: profile.totalXp,
      rareAccessActive: qualification.rareRewardAccessActive,
      currentStreak: profile.currentStreak,
      qualificationStatus: qualification.qualificationStatus,
      rareRewardAccessActive: qualification.rareRewardAccessActive,
    };
  }

  private hasMissedDay(lastCheckInDate: string | null, today: string): boolean {
    if (!lastCheckInDate || lastCheckInDate === today) {
      return false;
    }
    return this.dayDiff(lastCheckInDate, today) > 1;
  }

  private calculateNextStreak(
    currentStreak: number,
    lastCheckInDate: string | null,
    today: string,
  ): number {
    if (!lastCheckInDate || lastCheckInDate === today) {
      return 1;
    }

    const daysSinceLastCheckIn = this.dayDiff(lastCheckInDate, today);
    if (daysSinceLastCheckIn === 1) {
      return currentStreak + 1;
    }

    return 1;
  }

  private dayDiff(fromDate: string, toDate: string): number {
    const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
    const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
    return Math.floor((to - from) / (24 * 60 * 60 * 1000));
  }

  private getUtcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
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

  private assertTxHash(txHash?: string): void {
    if (!txHash) {
      return;
    }

    const normalized = txHash.trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(normalized)) {
      throw new BadRequestException('Invalid txHash format');
    }
  }
}
