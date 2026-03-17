import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquippedStyleSnapshotToProfiles1742100000000
  implements MigrationInterface
{
  name = 'AddEquippedStyleSnapshotToProfiles1742100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "equippedStyleSnapshot" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN "equippedStyleSnapshot"`,
    );
  }
}
