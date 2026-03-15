import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMvpInvariantPartialIndexes1741990000000 implements MigrationInterface {
  name = 'AddMvpInvariantPartialIndexes1741990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bubble_sessions_one_active_per_profile" ON "bubble_sessions" ("profileId") WHERE "isCompleted" = false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_token_claims_one_pending_per_profile_token" ON "token_claims" ("profileId", "tokenSymbol") WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_token_claims_one_pending_per_profile_token"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bubble_sessions_one_active_per_profile"`,
    );
  }
}
