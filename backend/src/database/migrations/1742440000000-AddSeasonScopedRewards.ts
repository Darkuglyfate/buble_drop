import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonScopedRewards1742440000000 implements MigrationInterface {
  name = 'AddSeasonScopedRewards1742440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD "seasonId" uuid`,
    );
    await queryRunner.query(`ALTER TABLE "reward_events" ADD "seasonId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "rare_reward_entitlements" ADD "seasonId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "weekly_token_tickets" ADD "seasonId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "qualification_states" ADD "seasonId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "claimable_token_balances" ADD "seasonId" uuid`,
    );
    await queryRunner.query(`ALTER TABLE "token_claims" ADD "seasonId" uuid`);
    await queryRunner.query(`
      DELETE FROM "rare_reward_entitlements"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "reward_events"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "weekly_token_tickets"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "claimable_token_balances"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "token_claims"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "profile_nft_ownerships"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
        OR "nftDefinitionId" IN (
          SELECT "id" FROM "nft_definitions" WHERE "key" = 'genesis-spark'
        )
    `);
    await queryRunner.query(`
      DELETE FROM "profile_cosmetic_unlocks"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
        OR "cosmeticDefinitionId" IN (
          SELECT "id" FROM "cosmetic_definitions" WHERE "key" = 'glossy-aura'
        )
    `);
    await queryRunner.query(`
      DELETE FROM "profile_avatar_unlocks"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "qualification_states"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "check_in_records"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "bubble_sessions"
      WHERE "profileId" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "referrals"
      WHERE "id" IN (
        '30000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "profiles"
      WHERE "id" IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "user_wallets"
      WHERE "id" IN (
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "nft_definitions"
      WHERE "key" = 'genesis-spark'
    `);
    await queryRunner.query(`
      DELETE FROM "cosmetic_definitions"
      WHERE "key" = 'glossy-aura'
    `);
    await queryRunner.query(`
      DELETE FROM "partner_tokens"
      WHERE "symbol" IN ('BUBL', 'POP')
        AND "seasonId" IN (
          SELECT "id"
          FROM "seasons"
          WHERE "key" IN ('genesis-bloom', 'testnet-waves')
        )
    `);
    await queryRunner.query(`
      DELETE FROM "seasons"
      WHERE "key" IN ('genesis-bloom', 'testnet-waves')
    `);
    await queryRunner.query(`
      WITH "unique_symbol_seasons" AS (
        SELECT
          "symbol",
          MIN("seasonId"::text)::uuid AS "seasonId"
        FROM "partner_tokens"
        GROUP BY "symbol"
        HAVING COUNT(DISTINCT "seasonId") = 1
      )
      UPDATE "claimable_token_balances" AS "balance"
      SET "seasonId" = "uniqueSymbolSeason"."seasonId"
      FROM "unique_symbol_seasons" AS "uniqueSymbolSeason"
      WHERE "balance"."tokenSymbol" = "uniqueSymbolSeason"."symbol"
        AND "balance"."seasonId" IS NULL
    `);
    await queryRunner.query(`
      WITH "unique_contract_seasons" AS (
        SELECT
          LOWER("contractAddress") AS "contractAddress",
          MIN("seasonId"::text)::uuid AS "seasonId"
        FROM "partner_tokens"
        GROUP BY LOWER("contractAddress")
        HAVING COUNT(DISTINCT "seasonId") = 1
      )
      UPDATE "token_claims" AS "claim"
      SET "seasonId" = "uniqueContractSeason"."seasonId"
      FROM "unique_contract_seasons" AS "uniqueContractSeason"
      WHERE LOWER("claim"."tokenContractAddress") = "uniqueContractSeason"."contractAddress"
        AND "claim"."seasonId" IS NULL
    `);
    await queryRunner.query(`
      WITH "unique_symbol_seasons" AS (
        SELECT
          "symbol",
          MIN("seasonId"::text)::uuid AS "seasonId"
        FROM "partner_tokens"
        GROUP BY "symbol"
        HAVING COUNT(DISTINCT "seasonId") = 1
      )
      UPDATE "token_claims" AS "claim"
      SET "seasonId" = "uniqueSymbolSeason"."seasonId"
      FROM "unique_symbol_seasons" AS "uniqueSymbolSeason"
      WHERE "claim"."tokenSymbol" = "uniqueSymbolSeason"."symbol"
        AND "claim"."seasonId" IS NULL
    `);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_claimable_token_balances_profile_token"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_claimable_token_balances_profile_season_token" ON "claimable_token_balances" ("profileId", "seasonId", "tokenSymbol") WHERE "seasonId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_claimable_token_balances_legacy_profile_token" ON "claimable_token_balances" ("profileId", "tokenSymbol") WHERE "seasonId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_claimable_token_balances_season_id" ON "claimable_token_balances" ("seasonId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_token_claims_season_id" ON "token_claims" ("seasonId")`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_qualification_states_profile_id"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_qualification_states_profile_id" ON "qualification_states" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_qualification_states_profile_season" ON "qualification_states" ("profileId", "seasonId") WHERE "seasonId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bubble_sessions_profile_season" ON "bubble_sessions" ("profileId", "seasonId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reward_events_profile_season" ON "reward_events" ("profileId", "seasonId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rare_reward_entitlements_season_status" ON "rare_reward_entitlements" ("seasonId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_weekly_token_tickets_season_id" ON "weekly_token_tickets" ("seasonId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" ADD CONSTRAINT "FK_bubble_sessions_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_events" ADD CONSTRAINT "FK_reward_events_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rare_reward_entitlements" ADD CONSTRAINT "FK_rare_reward_entitlements_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "weekly_token_tickets" ADD CONSTRAINT "FK_weekly_token_tickets_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "qualification_states" ADD CONSTRAINT "FK_qualification_states_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claimable_token_balances" ADD CONSTRAINT "FK_claimable_token_balances_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "token_claims" ADD CONSTRAINT "FK_token_claims_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The allowlisted demo-data cleanup in up() is intentionally irreversible.
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP CONSTRAINT "FK_token_claims_season"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claimable_token_balances" DROP CONSTRAINT "FK_claimable_token_balances_season"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_token_claims_season_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_claimable_token_balances_season_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_claimable_token_balances_legacy_profile_token"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_claimable_token_balances_profile_season_token"`,
    );
    await queryRunner.query(`
      WITH "grouped_balances" AS (
        SELECT
          MIN("id"::text)::uuid AS "keeperId",
          "profileId",
          "tokenSymbol",
          SUM("claimableAmount") AS "claimableAmount"
        FROM "claimable_token_balances"
        GROUP BY "profileId", "tokenSymbol"
      )
      UPDATE "claimable_token_balances" AS "balance"
      SET "claimableAmount" = "groupedBalance"."claimableAmount"
      FROM "grouped_balances" AS "groupedBalance"
      WHERE "balance"."id" = "groupedBalance"."keeperId"
    `);
    await queryRunner.query(`
      WITH "ranked_balances" AS (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "profileId", "tokenSymbol"
            ORDER BY "id"
          ) AS "rowNumber"
        FROM "claimable_token_balances"
      )
      DELETE FROM "claimable_token_balances" AS "balance"
      USING "ranked_balances" AS "rankedBalance"
      WHERE "balance"."id" = "rankedBalance"."id"
        AND "rankedBalance"."rowNumber" > 1
    `);
    await queryRunner.query(
      `ALTER TABLE "token_claims" DROP COLUMN "seasonId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claimable_token_balances" DROP COLUMN "seasonId"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_claimable_token_balances_profile_token" ON "claimable_token_balances" ("profileId", "tokenSymbol")`,
    );
    await queryRunner.query(
      `ALTER TABLE "qualification_states" DROP CONSTRAINT "FK_qualification_states_season"`,
    );
    await queryRunner.query(
      `ALTER TABLE "weekly_token_tickets" DROP CONSTRAINT "FK_weekly_token_tickets_season"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rare_reward_entitlements" DROP CONSTRAINT "FK_rare_reward_entitlements_season"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_events" DROP CONSTRAINT "FK_reward_events_season"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP CONSTRAINT "FK_bubble_sessions_season"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_weekly_token_tickets_season_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rare_reward_entitlements_season_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_reward_events_profile_season"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bubble_sessions_profile_season"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_qualification_states_profile_season"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_qualification_states_profile_id"`,
    );
    await queryRunner.query(`
      WITH "ranked_qualification_states" AS (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "profileId"
            ORDER BY "updatedAt" DESC, "id" DESC
          ) AS "rowNumber"
        FROM "qualification_states"
      )
      DELETE FROM "qualification_states" AS "qualificationState"
      USING "ranked_qualification_states" AS "rankedQualificationState"
      WHERE "qualificationState"."id" = "rankedQualificationState"."id"
        AND "rankedQualificationState"."rowNumber" > 1
    `);
    await queryRunner.query(
      `ALTER TABLE "weekly_token_tickets" DROP COLUMN "seasonId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rare_reward_entitlements" DROP COLUMN "seasonId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_events" DROP COLUMN "seasonId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bubble_sessions" DROP COLUMN "seasonId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "qualification_states" DROP COLUMN "seasonId"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_qualification_states_profile_id" ON "qualification_states" ("profileId")`,
    );
  }
}
