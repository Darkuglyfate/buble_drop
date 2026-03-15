import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialBubbleDropSchema1741950000000 implements MigrationInterface {
  name = 'InitialBubbleDropSchema1741950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(
      `CREATE TYPE "public"."qualification_states_status_enum" AS ENUM('locked', 'in_progress', 'qualified', 'paused', 'restored')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."referrals_status_enum" AS ENUM('pending', 'successful')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reward_events_eventtype_enum" AS ENUM('xp', 'token_ticket', 'nft', 'cosmetic')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."token_claims_status_enum" AS ENUM('pending', 'confirmed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."nft_definitions_tier_enum" AS ENUM('simple', 'rare')`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_wallets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "address" character varying(42) NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_wallets_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_wallets_address" ON "user_wallets" ("address")`,
    );

    await queryRunner.query(`
      CREATE TABLE "avatars" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(64) NOT NULL,
        "label" character varying(64) NOT NULL,
        "isStarter" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_avatars_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_avatars_key" ON "avatars" ("key")`,
    );

    await queryRunner.query(`
      CREATE TABLE "rank_frame_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(32) NOT NULL,
        "label" character varying(64) NOT NULL,
        "order" integer NOT NULL,
        "minLifetimeXp" integer NOT NULL,
        CONSTRAINT "PK_rank_frame_definitions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_rank_frame_definitions_key" ON "rank_frame_definitions" ("key")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_rank_frame_definitions_order" ON "rank_frame_definitions" ("order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "nft_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(64) NOT NULL,
        "label" character varying(64) NOT NULL,
        "tier" "public"."nft_definitions_tier_enum" NOT NULL,
        "minStreak" integer NOT NULL,
        "minXp" integer NOT NULL,
        "minSessions" integer NOT NULL,
        "dropChancePercent" decimal(5,2) NOT NULL,
        "cooldownDays" integer NOT NULL,
        CONSTRAINT "PK_nft_definitions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_nft_definitions_key" ON "nft_definitions" ("key")`,
    );

    await queryRunner.query(`
      CREATE TABLE "cosmetic_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(64) NOT NULL,
        "label" character varying(64) NOT NULL,
        "minStreak" integer NOT NULL,
        "minXp" integer NOT NULL,
        CONSTRAINT "PK_cosmetic_definitions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cosmetic_definitions_key" ON "cosmetic_definitions" ("key")`,
    );

    await queryRunner.query(`
      CREATE TABLE "seasons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(64) NOT NULL,
        "title" character varying(128) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "isActive" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seasons_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_seasons_key" ON "seasons" ("key")`,
    );

    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "walletId" uuid NOT NULL,
        "nickname" character varying(32),
        "currentAvatarId" uuid,
        "totalXp" integer NOT NULL DEFAULT 0,
        "currentStreak" integer NOT NULL DEFAULT 0,
        "onboardingCompletedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profiles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profiles_wallet" FOREIGN KEY ("walletId") REFERENCES "user_wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_profiles_current_avatar" FOREIGN KEY ("currentAvatarId") REFERENCES "avatars"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_profiles_wallet_id" ON "profiles" ("walletId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_profiles_nickname" ON "profiles" ("nickname")`,
    );

    await queryRunner.query(`
      CREATE TABLE "qualification_states" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "status" "public"."qualification_states_status_enum" NOT NULL DEFAULT 'locked',
        "qualifiedAt" TIMESTAMPTZ,
        "pausedAt" TIMESTAMPTZ,
        "restoredAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_qualification_states_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_qualification_states_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_qualification_states_profile_id" ON "qualification_states" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "claimable_token_balances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "tokenSymbol" character varying(64) NOT NULL,
        "claimableAmount" numeric(36,0) NOT NULL DEFAULT '0',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_claimable_token_balances_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_claimable_token_balances_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_claimable_token_balances_profile_id" ON "claimable_token_balances" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_claimable_token_balances_profile_token" ON "claimable_token_balances" ("profileId", "tokenSymbol")`,
    );

    await queryRunner.query(`
      CREATE TABLE "profile_avatar_unlocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "avatarId" uuid NOT NULL,
        "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_avatar_unlocks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profile_avatar_unlocks_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_profile_avatar_unlocks_avatar" FOREIGN KEY ("avatarId") REFERENCES "avatars"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_avatar_unlocks_profile_id" ON "profile_avatar_unlocks" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_avatar_unlocks_avatar_id" ON "profile_avatar_unlocks" ("avatarId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_profile_avatar_unlocks_profile_avatar" ON "profile_avatar_unlocks" ("profileId", "avatarId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "profile_nft_ownerships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "nftDefinitionId" uuid NOT NULL,
        "acquiredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_nft_ownerships_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profile_nft_ownerships_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_profile_nft_ownerships_nft_definition" FOREIGN KEY ("nftDefinitionId") REFERENCES "nft_definitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_nft_ownerships_profile_id" ON "profile_nft_ownerships" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_nft_ownerships_nft_definition_id" ON "profile_nft_ownerships" ("nftDefinitionId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_profile_nft_ownerships_profile_nft" ON "profile_nft_ownerships" ("profileId", "nftDefinitionId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "profile_cosmetic_unlocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "cosmeticDefinitionId" uuid NOT NULL,
        "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profile_cosmetic_unlocks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_profile_cosmetic_unlocks_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_profile_cosmetic_unlocks_cosmetic_definition" FOREIGN KEY ("cosmeticDefinitionId") REFERENCES "cosmetic_definitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_cosmetic_unlocks_profile_id" ON "profile_cosmetic_unlocks" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_profile_cosmetic_unlocks_cosmetic_definition_id" ON "profile_cosmetic_unlocks" ("cosmeticDefinitionId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_profile_cosmetic_unlocks_profile_cosmetic" ON "profile_cosmetic_unlocks" ("profileId", "cosmeticDefinitionId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "partner_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "seasonId" uuid NOT NULL,
        "symbol" character varying(64) NOT NULL,
        "name" character varying(128) NOT NULL,
        "contractAddress" character varying(42) NOT NULL,
        "twitterUrl" character varying(255) NOT NULL,
        "chartUrl" character varying(255),
        "dexscreenerUrl" character varying(255),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_partner_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_partner_tokens_season" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_partner_tokens_season_id" ON "partner_tokens" ("seasonId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_partner_tokens_season_symbol" ON "partner_tokens" ("seasonId", "symbol")`,
    );

    await queryRunner.query(`
      CREATE TABLE "partner_token_pins" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "partnerTokenId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_partner_token_pins_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_partner_token_pins_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_partner_token_pins_partner_token" FOREIGN KEY ("partnerTokenId") REFERENCES "partner_tokens"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_partner_token_pins_profile_id" ON "partner_token_pins" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_partner_token_pins_partner_token_id" ON "partner_token_pins" ("partnerTokenId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_partner_token_pins_profile_partner_token" ON "partner_token_pins" ("profileId", "partnerTokenId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "inviterProfileId" uuid NOT NULL,
        "invitedWalletAddress" character varying(42) NOT NULL,
        "invitedProfileId" uuid,
        "status" "public"."referrals_status_enum" NOT NULL DEFAULT 'pending',
        "successfulAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_referrals_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_referrals_inviter_profile" FOREIGN KEY ("inviterProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_referrals_invited_profile" FOREIGN KEY ("invitedProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_referrals_inviter_profile_id" ON "referrals" ("inviterProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_referrals_invited_wallet_address" ON "referrals" ("invitedWalletAddress")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_referrals_inviter_wallet" ON "referrals" ("inviterProfileId", "invitedWalletAddress")`,
    );

    await queryRunner.query(`
      CREATE TABLE "reward_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "eventType" "public"."reward_events_eventtype_enum" NOT NULL,
        "xpAmount" integer,
        "tokenSymbol" character varying(64),
        "metadata" jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reward_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reward_events_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_reward_events_profile_id" ON "reward_events" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "weekly_token_tickets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "weekStartDate" date NOT NULL,
        "tokenSymbol" character varying(64) NOT NULL,
        "weight" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_weekly_token_tickets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_weekly_token_tickets_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_weekly_token_tickets_profile_id" ON "weekly_token_tickets" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_weekly_token_tickets_profile_week_symbol" ON "weekly_token_tickets" ("profileId", "weekStartDate", "tokenSymbol")`,
    );

    await queryRunner.query(`
      CREATE TABLE "bubble_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "endedAt" TIMESTAMPTZ,
        "activeSeconds" integer NOT NULL DEFAULT 0,
        "isCompleted" boolean NOT NULL DEFAULT false,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bubble_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bubble_sessions_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bubble_sessions_profile_id" ON "bubble_sessions" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "check_in_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "checkInDate" date NOT NULL,
        "txHash" character varying(66),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_check_in_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_check_in_records_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_check_in_records_profile_id" ON "check_in_records" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_check_in_records_profile_date" ON "check_in_records" ("profileId", "checkInDate")`,
    );

    await queryRunner.query(`
      CREATE TABLE "token_claims" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profileId" uuid NOT NULL,
        "tokenSymbol" character varying(64) NOT NULL,
        "amount" numeric(36,0) NOT NULL,
        "status" "public"."token_claims_status_enum" NOT NULL DEFAULT 'pending',
        "txHash" character varying(66),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_token_claims_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_token_claims_profile" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_token_claims_profile_id" ON "token_claims" ("profileId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_token_claims_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "token_claims"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_check_in_records_profile_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_check_in_records_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "check_in_records"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bubble_sessions_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "bubble_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_weekly_token_tickets_profile_week_symbol"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_weekly_token_tickets_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "weekly_token_tickets"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_reward_events_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "reward_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_referrals_inviter_wallet"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_referrals_invited_wallet_address"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_referrals_inviter_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "referrals"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_partner_token_pins_profile_partner_token"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_partner_token_pins_partner_token_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_partner_token_pins_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "partner_token_pins"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_partner_tokens_season_symbol"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_partner_tokens_season_id"`,
    );
    await queryRunner.query(`DROP TABLE "partner_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_cosmetic_unlocks_profile_cosmetic"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_cosmetic_unlocks_cosmetic_definition_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_cosmetic_unlocks_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_cosmetic_unlocks"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_nft_ownerships_profile_nft"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_nft_ownerships_nft_definition_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_nft_ownerships_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_nft_ownerships"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_avatar_unlocks_profile_avatar"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_avatar_unlocks_avatar_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_profile_avatar_unlocks_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "profile_avatar_unlocks"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_claimable_token_balances_profile_token"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_claimable_token_balances_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "claimable_token_balances"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_qualification_states_profile_id"`,
    );
    await queryRunner.query(`DROP TABLE "qualification_states"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_profiles_nickname"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_profiles_wallet_id"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_seasons_key"`);
    await queryRunner.query(`DROP TABLE "seasons"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cosmetic_definitions_key"`,
    );
    await queryRunner.query(`DROP TABLE "cosmetic_definitions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_nft_definitions_key"`);
    await queryRunner.query(`DROP TABLE "nft_definitions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rank_frame_definitions_order"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rank_frame_definitions_key"`,
    );
    await queryRunner.query(`DROP TABLE "rank_frame_definitions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_avatars_key"`);
    await queryRunner.query(`DROP TABLE "avatars"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_wallets_address"`);
    await queryRunner.query(`DROP TABLE "user_wallets"`);

    await queryRunner.query(`DROP TYPE "public"."nft_definitions_tier_enum"`);
    await queryRunner.query(`DROP TYPE "public"."token_claims_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."reward_events_eventtype_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."referrals_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."qualification_states_status_enum"`,
    );
  }
}
