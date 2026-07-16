import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckInFinalityState1742410000000 implements MigrationInterface {
  name = 'AddCheckInFinalityState1742410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."check_in_records_status_enum" AS ENUM('pending', 'confirmed', 'orphaned')`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" ADD "status" "public"."check_in_records_status_enum" NOT NULL DEFAULT 'confirmed'`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" ADD "chainId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" ADD "txLogIndex" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" ADD "blockNumber" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" ADD "blockHash" character varying(66)`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" ADD "confirmedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_check_in_records_profile_date"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_check_in_records_active_profile_date" ON "check_in_records" ("profileId", "checkInDate") WHERE "status" <> 'orphaned'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_check_in_records_chain_tx_log_index_unique" ON "check_in_records" ("chainId", "txHash", "txLogIndex") WHERE "chainId" IS NOT NULL AND "txHash" IS NOT NULL AND "txLogIndex" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_check_in_records_chain_tx_log_index_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_check_in_records_active_profile_date"`,
    );
    await queryRunner.query(
      `DELETE FROM "check_in_records" WHERE "status" = 'orphaned'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_check_in_records_profile_date" ON "check_in_records" ("profileId", "checkInDate")`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" DROP COLUMN "confirmedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" DROP COLUMN "blockHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" DROP COLUMN "blockNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" DROP COLUMN "txLogIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" DROP COLUMN "chainId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_in_records" DROP COLUMN "status"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."check_in_records_status_enum"`,
    );
  }
}
