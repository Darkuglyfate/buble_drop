import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenClaimProcessedAt1741996000000 implements MigrationInterface {
  name = 'AddTokenClaimProcessedAt1741996000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD "processedAt" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "processedAt"`,
    );
  }
}
