import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarPaletteKey1742205000000 implements MigrationInterface {
  name = 'AddAvatarPaletteKey1742205000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "avatars" ADD "paletteKey" character varying(32) NOT NULL DEFAULT 'blue'`,
    );
    await queryRunner.query(`
      UPDATE "avatars"
      SET "paletteKey" = CASE
        WHEN "key" = 'starter-bubble-blue' THEN 'blue'
        WHEN "key" = 'starter-bubble-lilac' THEN 'lilac'
        WHEN "key" = 'starter-bubble-rose' THEN 'rose'
        WHEN "key" = 'starter-bubble-mint' THEN 'mint'
        WHEN "key" = 'starter-bubble-peach' THEN 'peach'
        WHEN "key" = 'starter-bubble-amber' THEN 'amber'
        WHEN "key" = 'starter-bubble-sky' THEN 'sky'
        WHEN "key" = 'starter-bubble-violet' THEN 'violet'
        ELSE "paletteKey"
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "avatars" DROP COLUMN "paletteKey"`);
  }
}
