import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSingleActiveSeasonInvariant1741995000000 implements MigrationInterface {
  name = 'AddSingleActiveSeasonInvariant1741995000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_seasons_one_active_season" ON "seasons" ("isActive") WHERE "isActive" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_seasons_one_active_season"`,
    );
  }
}
