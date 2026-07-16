import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddXpRewardIdempotency1742400000000 implements MigrationInterface {
  name = 'AddXpRewardIdempotency1742400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reward_events" ADD "idempotencyKey" character varying(160)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_reward_events_idempotency_key_unique" ON "reward_events" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_reward_events_idempotency_key_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_events" DROP COLUMN "idempotencyKey"`,
    );
  }
}
