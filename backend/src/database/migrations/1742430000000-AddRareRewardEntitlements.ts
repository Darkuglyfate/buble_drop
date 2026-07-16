import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRareRewardEntitlements1742430000000 implements MigrationInterface {
  name = 'AddRareRewardEntitlements1742430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."rare_reward_entitlements_status_enum" AS ENUM('pending', 'processing', 'issued', 'failed')`,
    );
    await queryRunner.query(`
      CREATE TABLE "rare_reward_entitlements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sessionId" uuid NOT NULL,
        "profileId" uuid NOT NULL,
        "idempotencyKey" character varying(160) NOT NULL,
        "status" "public"."rare_reward_entitlements_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "processingStartedAt" TIMESTAMP WITH TIME ZONE,
        "issuedAt" TIMESTAMP WITH TIME ZONE,
        "lastError" text,
        "outcome" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rare_reward_entitlements_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rare_reward_entitlements_session" FOREIGN KEY ("sessionId") REFERENCES "bubble_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_rare_reward_entitlements_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_rare_reward_entitlements_session_id" ON "rare_reward_entitlements" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_rare_reward_entitlements_idempotency_key" ON "rare_reward_entitlements" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rare_reward_entitlements_status_processing" ON "rare_reward_entitlements" ("status", "processingStartedAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "weekly_token_tickets" ADD "idempotencyKey" character varying(160)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_weekly_token_tickets_idempotency_key_unique" ON "weekly_token_tickets" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_nft_ownerships" ADD "idempotencyKey" character varying(160)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_profile_nft_ownerships_idempotency_key_unique" ON "profile_nft_ownerships" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_cosmetic_unlocks" ADD "idempotencyKey" character varying(160)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_profile_cosmetic_unlocks_idempotency_key_unique" ON "profile_cosmetic_unlocks" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_cosmetic_unlocks_idempotency_key_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_cosmetic_unlocks" DROP COLUMN "idempotencyKey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_nft_ownerships_idempotency_key_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_nft_ownerships" DROP COLUMN "idempotencyKey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_weekly_token_tickets_idempotency_key_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "weekly_token_tickets" DROP COLUMN "idempotencyKey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rare_reward_entitlements_status_processing"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rare_reward_entitlements_idempotency_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rare_reward_entitlements_session_id"`,
    );
    await queryRunner.query(`DROP TABLE "rare_reward_entitlements"`);
    await queryRunner.query(
      `DROP TYPE "public"."rare_reward_entitlements_status_enum"`,
    );
  }
}
