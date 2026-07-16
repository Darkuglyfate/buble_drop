import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { SeasonService } from '../partner-token/season.service';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import {
  RewardEvent,
  RewardEventType,
} from '../rewards/entities/reward-event.entity';
import { XpService, XpSource } from '../rewards/xp.service';
import {
  CheckInRecord,
  CheckInStatus,
} from './entities/check-in-record.entity';
import {
  CanonicalCheckInReceiptInput,
  CheckInReceiptVerification,
  CheckInReceiptVerifier,
} from './check-in-receipt-verifier.service';

const DAILY_CHECK_IN_XP = 20;

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
  onchain: {
    mode: 'user-paid';
    txHash: string | null;
  };
}

@Injectable()
export class CheckInService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CheckInRecord)
    private readonly checkInRecordRepository: Repository<CheckInRecord>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly qualificationService: QualificationService,
    private readonly xpService: XpService,
    private readonly checkInReceiptVerifier: CheckInReceiptVerifier,
    private readonly seasonService: SeasonService,
  ) {}

  async performDailyCheckIn(
    profileId: string,
    txHash?: string,
  ): Promise<DailyCheckInResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    this.assertTxHash(txHash);

    const today = this.getUtcDateKey(new Date());
    const onchainTxHash = txHash?.trim().toLowerCase() ?? null;
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: {
        wallet: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    if (profile.wallet?.address && !onchainTxHash) {
      throw new BadRequestException(
        'Daily check-in requires a confirmed user wallet transaction',
      );
    }

    const existingToday = await this.checkInRecordRepository.findOne({
      where: {
        profileId,
        checkInDate: today,
        status: In([CheckInStatus.PENDING, CheckInStatus.CONFIRMED]),
      },
    });
    let recordToOrphan: CheckInRecord | null = null;
    if (existingToday) {
      const canonicalInput = this.getCanonicalRecheckInput(
        profile.wallet?.address,
        existingToday,
      );
      if (
        !canonicalInput ||
        (await this.checkInReceiptVerifier.isCanonical(canonicalInput))
      ) {
        throw new ConflictException(
          'Daily check-in already completed for today',
        );
      }
      recordToOrphan = existingToday;
    }

    const verifiedReceipt = await this.verifyReceiptIfRequired(
      profile.wallet?.address,
      today,
      onchainTxHash,
    );

    const transactionResult = await this.dataSource.transaction(
      async (entityManager) => {
        const transactionProfileRepository =
          entityManager.getRepository(Profile);
        const transactionCheckInRepository =
          entityManager.getRepository(CheckInRecord);
        const rewardEventRepository = entityManager.getRepository(RewardEvent);
        const activeSeason = await this.seasonService.getActiveSeason(
          new Date(),
          entityManager,
        );
        const transactionProfile = await transactionProfileRepository.findOne({
          where: { id: profileId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!transactionProfile) {
          throw new NotFoundException('Profile not found');
        }

        const lockedExistingToday = await transactionCheckInRepository.findOne({
          where: {
            profileId,
            checkInDate: today,
            status: In([CheckInStatus.PENDING, CheckInStatus.CONFIRMED]),
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (recordToOrphan) {
          if (
            !lockedExistingToday ||
            lockedExistingToday.id !== recordToOrphan.id ||
            lockedExistingToday.status !== CheckInStatus.CONFIRMED
          ) {
            throw new ConflictException(
              'Daily check-in already completed for today',
            );
          }

          const orphaned = await transactionCheckInRepository.update(
            { id: recordToOrphan.id, status: CheckInStatus.CONFIRMED },
            { status: CheckInStatus.ORPHANED },
          );
          if (orphaned.affected !== 1) {
            throw new ConflictException(
              'Daily check-in already completed for today',
            );
          }

          const originalDailyCheckInReward =
            await rewardEventRepository.findOne({
              where: {
                profileId,
                eventType: RewardEventType.XP,
                idempotencyKey: this.getCheckInIdempotencyKey(
                  recordToOrphan.profileId,
                  recordToOrphan.checkInDate,
                  recordToOrphan.txHash,
                  recordToOrphan.txLogIndex,
                ),
              },
              select: ['xpAmount', 'seasonId'],
            });
          const reversalAmount = originalDailyCheckInReward?.xpAmount ?? 0;

          await this.xpService.grantXp(
            profileId,
            [
              {
                source: XpSource.DAILY_CHECK_IN_REORG_REVERSAL,
                amount: -reversalAmount,
                seasonId: originalDailyCheckInReward?.seasonId ?? null,
                idempotencyKey: this.getReversalIdempotencyKey(recordToOrphan),
                metadata: {
                  checkInDate: today,
                  orphanedCheckInRecordId: recordToOrphan.id,
                },
              },
            ],
            undefined,
            entityManager,
          );
        } else if (lockedExistingToday) {
          throw new ConflictException(
            'Daily check-in already completed for today',
          );
        }

        let missedDay = false;
        if (!recordToOrphan) {
          const lastRecord = await transactionCheckInRepository.findOne({
            where: { profileId, status: CheckInStatus.CONFIRMED },
            order: { checkInDate: 'DESC' },
          });
          missedDay = this.hasMissedDay(lastRecord?.checkInDate ?? null, today);
          transactionProfile.currentStreak = this.calculateNextStreak(
            transactionProfile.currentStreak,
            lastRecord?.checkInDate ?? null,
            today,
          );
          await transactionProfileRepository.save(transactionProfile);
        }

        const record = transactionCheckInRepository.create({
          profileId,
          checkInDate: today,
          txHash: onchainTxHash,
          status: CheckInStatus.CONFIRMED,
          chainId: verifiedReceipt?.chainId ?? null,
          txLogIndex: verifiedReceipt?.txLogIndex ?? null,
          blockNumber: verifiedReceipt?.blockNumber ?? null,
          blockHash: verifiedReceipt?.blockHash ?? null,
          confirmedAt: verifiedReceipt?.confirmedAt ?? new Date(),
        });
        await transactionCheckInRepository.save(record);

        const xpGrant = await this.xpService.grantXp(
          profileId,
          [
            {
              source: XpSource.DAILY_CHECK_IN,
              amount: DAILY_CHECK_IN_XP,
              seasonId: activeSeason?.id ?? null,
              idempotencyKey: this.getCheckInIdempotencyKey(
                profileId,
                today,
                onchainTxHash,
                verifiedReceipt?.txLogIndex ?? null,
              ),
              metadata: {
                checkInDate: today,
                txHash: onchainTxHash,
              },
            },
          ],
          undefined,
          entityManager,
        );
        const profileWithUpdatedXp = await transactionProfileRepository.findOne(
          {
            where: { id: transactionProfile.id },
          },
        );

        return {
          profile: transactionProfile,
          seasonId: activeSeason?.id ?? null,
          missedDay,
          xpAwarded: xpGrant.grantedTotal,
          totalXp: profileWithUpdatedXp?.totalXp ?? transactionProfile.totalXp,
        };
      },
    );

    const qualification =
      await this.qualificationService.processAfterDailyCheckIn(
        profileId,
        transactionResult.missedDay,
        transactionResult.seasonId,
      );

    return {
      success: true,
      profileId: transactionResult.profile.id,
      checkInDate: today,
      xpAwarded: transactionResult.xpAwarded,
      newStreak: transactionResult.profile.currentStreak,
      totalXp: transactionResult.totalXp,
      rareAccessActive: qualification.rareRewardAccessActive,
      currentStreak: transactionResult.profile.currentStreak,
      qualificationStatus: qualification.qualificationStatus,
      rareRewardAccessActive: qualification.rareRewardAccessActive,
      onchain: {
        mode: 'user-paid',
        txHash: onchainTxHash,
      },
    };
  }

  private async verifyReceiptIfRequired(
    walletAddress: string | undefined,
    checkInDate: string,
    txHash: string | null,
  ): Promise<CheckInReceiptVerification | null> {
    if (!walletAddress || !txHash) {
      return null;
    }
    return this.checkInReceiptVerifier.verify({
      walletAddress,
      checkInDate,
      txHash,
    });
  }

  private getCanonicalRecheckInput(
    walletAddress: string | undefined,
    record: CheckInRecord,
  ): CanonicalCheckInReceiptInput | null {
    if (
      !walletAddress ||
      record.status !== CheckInStatus.CONFIRMED ||
      !record.txHash ||
      record.chainId === null ||
      record.txLogIndex === null ||
      record.blockNumber === null ||
      !record.blockHash
    ) {
      return null;
    }

    return {
      walletAddress,
      checkInDate: record.checkInDate,
      txHash: record.txHash,
      chainId: record.chainId,
      txLogIndex: record.txLogIndex,
      blockNumber: record.blockNumber,
      blockHash: record.blockHash,
    };
  }

  private getCheckInIdempotencyKey(
    profileId: string,
    checkInDate: string,
    txHash: string | null,
    txLogIndex: number | null,
  ): string {
    return `check-in:${profileId}:${checkInDate}:${txHash ?? 'offchain'}:${txLogIndex ?? 'none'}`;
  }

  private getReversalIdempotencyKey(record: CheckInRecord): string {
    return `check-in-reversal:${record.profileId}:${record.checkInDate}:${record.id}`;
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
