import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnknownPayoutState1742420000000 implements MigrationInterface {
  name = 'AddUnknownPayoutState1742420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."token_claims_status_enum" ADD VALUE IF NOT EXISTS 'unknown'`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "broadcastAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "reconciledAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "payoutError" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "recipientWalletAddress" character varying(42)`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "tokenContractAddress" character varying(42)`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "payoutSenderAddress" character varying(42)`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "payoutNonce" numeric(78,0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "serializedPayoutTransaction" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_token_claims_payout_sender_nonce" ON "token_claims" ("payoutSenderAddress", "payoutNonce") WHERE "payoutNonce" IS NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_token_claims_one_pending_per_profile_token"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_token_claims_one_pending_per_profile_token" ON "token_claims" ("profileId", "tokenSymbol") WHERE "status" <> 'confirmed' AND "status" <> 'failed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT pg_advisory_xact_lock(174245001)`);
    await queryRunner.query(
      `LOCK TABLE "token_claims" IN ACCESS EXCLUSIVE MODE`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "token_claims" WHERE "status" = 'unknown') THEN
          RAISE EXCEPTION 'Cannot roll back payout recovery while unknown token claims exist';
        END IF;
      END
      $$
    `);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_token_claims_payout_sender_nonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_token_claims_one_pending_per_profile_token"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_token_claims_one_pending_per_profile_token" ON "token_claims" ("profileId", "tokenSymbol") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "payoutError"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "serializedPayoutTransaction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "payoutNonce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "payoutSenderAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "tokenContractAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "recipientWalletAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "reconciledAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "broadcastAt"`,
    );
  }
}
