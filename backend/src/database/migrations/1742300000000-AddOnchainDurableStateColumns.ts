import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnchainDurableStateColumns1742300000000
  implements MigrationInterface
{
  name = 'AddOnchainDurableStateColumns1742300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD "finalScore" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD "bestCombo" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD "rewardFlags" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD "integrityHash" character varying(66)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD "outcomeTxHash" character varying(66)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD "outcomeRecordedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "settlementRecordTxHash" character varying(66)`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "settlementRecordedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "settlementRecordedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "settlementRecordTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP COLUMN "outcomeRecordedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP COLUMN "outcomeTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP COLUMN "integrityHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP COLUMN "rewardFlags"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP COLUMN "bestCombo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP COLUMN "finalScore"`,
    );
  }
}
